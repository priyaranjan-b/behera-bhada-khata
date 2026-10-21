import { createClient } from "@/lib/supabase/server";
import { ensureRentPeriods, currentMonthKey } from "@/lib/periods";
import { summarizeBalance } from "@/lib/allocation";
import { tenantDisplayName, formatUnitLabel } from "@/lib/tenant";
import type { RentPeriod } from "@/lib/types";
import TenantSearchList, { type TenantSearchRow } from "./TenantSearchList";

export default async function TenantsIndexPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase.from("properties").select("id, name, address");
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, business_name, unit_type, tower, floor, house_number, phone, property_id")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  for (const tenant of tenants ?? []) {
    await ensureRentPeriods(tenant.id);
  }

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: periods } = tenantIds.length
    ? await supabase
        .from("rent_periods")
        .select("id, tenant_id, period_month, amount_due, amount_allocated, status, created_at")
        .in("tenant_id", tenantIds)
    : { data: [] as RentPeriod[] };

  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods ?? []) {
    const list = periodsByTenant.get(period.tenant_id) ?? [];
    list.push(period);
    periodsByTenant.set(period.tenant_id, list);
  }

  const todayMonthKey = currentMonthKey();
  const rows: TenantSearchRow[] = (tenants ?? []).map((tenant) => {
    const property = propertyById.get(tenant.property_id);
    const balance = summarizeBalance(periodsByTenant.get(tenant.id) ?? [], todayMonthKey);
    return {
      tenantId: tenant.id,
      displayName: tenantDisplayName(tenant),
      contactName: tenant.business_name ? tenant.name : null,
      businessName: tenant.business_name,
      unitType: tenant.unit_type,
      unitLabel: formatUnitLabel(tenant),
      phone: tenant.phone,
      propertyName: property?.name ?? "Property",
      propertyAddress: property?.address ?? "",
      totalOutstanding: balance.totalOutstanding,
      overdueMonths: balance.overdueMonths,
    };
  });

  return <TenantSearchList rows={rows} />;
}

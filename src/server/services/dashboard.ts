import "server-only";
import { addMonths, format, startOfMonth } from "date-fns";
import type { DashboardSummary } from "@/lib/contracts";
import { buildBillingCollectionTrend, buildMonthlyReport } from "@/lib/reports";
import { tenantDisplayName } from "@/lib/tenant";
import type { RentPeriod } from "@/lib/types";
import { ownerDb } from "@/server/infra";
import type { OwnerContext } from "./context";
import { currentMonthKey, ensureRentPeriodsFor } from "./periods";

const TREND_MONTHS = 6;

/** `month` is yyyy-MM; anything else means the current month. */
function parseMonth(month?: string | null): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  return currentMonthKey();
}

export async function getDashboardSummary(ctx: OwnerContext, month?: string | null): Promise<DashboardSummary> {
  const monthKey = parseMonth(month);
  const db = await ownerDb(ctx.ownerId);

  const [properties, tenants] = await Promise.all([db.properties.list(), db.tenants.list({ status: "active" })]);
  const tenantIds = tenants.map((t) => t.id);
  await ensureRentPeriodsFor(tenantIds);

  const [periods, payments, adjustments] = await Promise.all([
    db.rentPeriods.listForTenants(tenantIds),
    db.payments.listForTenants(tenantIds, { status: "confirmed" }),
    db.adjustments.listForTenants(tenantIds, { status: "confirmed" }),
  ]);

  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    const list = periodsByTenant.get(period.tenant_id) ?? [];
    list.push(period);
    periodsByTenant.set(period.tenant_id, list);
  }

  const propertyNameById = new Map(properties.map((p) => [p.id, p.name]));
  const report = buildMonthlyReport(
    tenants.map((t) => ({
      id: t.id,
      name: tenantDisplayName(t),
      propertyName: propertyNameById.get(t.property_id) ?? "Property",
    })),
    periodsByTenant,
    monthKey,
    currentMonthKey()
  );

  const trendMonthKeys = Array.from({ length: TREND_MONTHS }, (_, i) =>
    format(addMonths(startOfMonth(new Date()), i - (TREND_MONTHS - 1)), "yyyy-MM")
  );
  const trend = buildBillingCollectionTrend(periods, payments, adjustments, trendMonthKeys);

  return { monthKey, report, trend };
}

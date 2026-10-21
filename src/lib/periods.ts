import "server-only";
import { addMonths, format, startOfMonth } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";

const LOOKAHEAD_MONTHS = 2;

function monthKey(d: Date): string {
  return format(startOfMonth(d), "yyyy-MM-dd");
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}

// Creates any rent_periods between the tenant's lease start and
// LOOKAHEAD_MONTHS from now that don't already exist, so a tenant who is
// months behind (or who the owner hasn't logged a payment for yet) always
// shows up as overdue rather than simply missing.
export async function ensureRentPeriods(tenantId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, monthly_rent_amount, lease_start")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) return;

  const start = startOfMonth(new Date(`${tenant.lease_start}T00:00:00Z`));
  const end = addMonths(startOfMonth(new Date()), LOOKAHEAD_MONTHS);

  const months: string[] = [];
  for (let d = start; d <= end; d = addMonths(d, 1)) {
    months.push(monthKey(d));
  }
  if (months.length === 0) return;

  const { data: existing } = await admin
    .from("rent_periods")
    .select("period_month")
    .eq("tenant_id", tenantId);

  const existingSet = new Set((existing ?? []).map((r) => r.period_month));
  const toInsert = months
    .filter((m) => !existingSet.has(m))
    .map((period_month) => ({
      tenant_id: tenantId,
      period_month,
      amount_due: tenant.monthly_rent_amount,
    }));

  if (toInsert.length > 0) {
    await admin.from("rent_periods").insert(toInsert);
  }
}

export { suggestAllocations, summarizeBalance } from "@/lib/allocation";
export type { AllocationSuggestion, TenantBalanceSummary } from "@/lib/allocation";

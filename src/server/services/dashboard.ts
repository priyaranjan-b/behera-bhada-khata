import "server-only";
import type { DashboardSummary } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { buildBillingCollectionTrend, buildMonthlyReport } from "@/lib/domain/reports";
import { tenantDisplayName } from "@/lib/domain/tenant";
import type { RentPeriod } from "@/lib/types";
import { ownerDb } from "@/server/infra";
import type { OwnerContext } from "./context";
import { ensureRentPeriodsFor } from "./periods";
import { loadPlacements, placementOf } from "./placements";

const TREND_MONTHS = 6;

/** `month` is yyyy-MM; anything else means the current month. */
function parseMonth(month?: string | null): string {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return `${month}-01`;
  return currentMonthKey();
}

export async function getDashboardSummary(ctx: OwnerContext, month?: string | null): Promise<DashboardSummary> {
  const monthKey = parseMonth(month);
  const todayMonthKey = currentMonthKey();
  const trendMonthKeys = Array.from({ length: TREND_MONTHS }, (_, i) =>
    addMonthsToKey(todayMonthKey, i - (TREND_MONTHS - 1))
  );
  // Everything below needs at most: unpaid periods (balances), the selected
  // month, and the trend window - not every settled month since lease start.
  const fromMonth = [monthKey, trendMonthKeys[0]].sort()[0];

  const db = await ownerDb();
  const allTenants = await db.tenants.list();
  const activeIds = allTenants.filter((t) => t.status === "active").map((t) => t.id);
  await ensureRentPeriodsFor(activeIds);

  const tenantIds = allTenants.map((t) => t.id);
  const [periods, payments, adjustments, placements] = await Promise.all([
    db.rentPeriods.listForTenants(tenantIds, { openOrFrom: fromMonth }),
    db.payments.listForTenants(tenantIds, { status: "confirmed", fromDate: trendMonthKeys[0] }),
    db.adjustments.listForTenants(tenantIds, { status: "confirmed", fromDate: trendMonthKeys[0] }),
    loadPlacements(db, tenantIds),
  ]);

  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    const list = periodsByTenant.get(period.tenant_id) ?? [];
    list.push(period);
    periodsByTenant.set(period.tenant_id, list);
  }

  // Current tenants, plus former ones who still owe - arrears don't vanish
  // when someone moves out.
  const owes = (id: string) =>
    (periodsByTenant.get(id) ?? []).some((p) => Number(p.amount_due) > Number(p.amount_allocated));
  // Drafts aren't billed yet, so they never owe.
  const tenants = allTenants.filter((t) => t.status === "active" || owes(t.id));

  const report = buildMonthlyReport(
    tenants.map((t) => ({
      id: t.id,
      name: tenantDisplayName(t),
      propertyName: placementOf(placements, t.id).propertyName,
      movedOut: t.status === "inactive",
    })),
    periodsByTenant,
    monthKey,
    todayMonthKey
  );

  const trend = buildBillingCollectionTrend(
    periods,
    payments,
    adjustments,
    trendMonthKeys.map((k) => k.slice(0, 7))
  );

  return { monthKey, report, trend };
}

import "server-only";
import type { DashboardSummary, DefaulterRow, DefaultersReport } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import {
  agingGroups,
  agingOf,
  buildBillingCollectionTrend,
  buildMonthlyReport,
  compareAging,
} from "@/lib/domain/reports";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
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

/**
 * Every tenant (current or moved out) with unpaid rent for a month that has
 * ended, most months behind first.
 */
export async function getDefaultersReport(_ctx: OwnerContext): Promise<DefaultersReport> {
  const todayMonthKey = currentMonthKey();
  const db = await ownerDb();
  const allTenants = await db.tenants.list();
  await ensureRentPeriodsFor(allTenants.filter((t) => t.status === "active").map((t) => t.id));

  const periods = await db.rentPeriods.listForTenants(
    allTenants.map((t) => t.id),
    { openOnly: true }
  );
  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    periodsByTenant.set(period.tenant_id, [...(periodsByTenant.get(period.tenant_id) ?? []), period]);
  }

  const behind = allTenants
    .map((tenant) => ({ tenant, aging: agingOf(periodsByTenant.get(tenant.id) ?? [], todayMonthKey) }))
    .filter(({ aging }) => aging.overdueMonths > 0);
  const ids = behind.map(({ tenant }) => tenant.id);
  const [payments, placements] = await Promise.all([
    db.payments.listForTenants(ids, { status: "confirmed" }),
    loadPlacements(db, ids),
  ]);
  const lastPaid = new Map<string, string>();
  for (const payment of payments) {
    const last = lastPaid.get(payment.tenant_id);
    if (!last || payment.payment_date > last) lastPaid.set(payment.tenant_id, payment.payment_date);
  }

  const rows: DefaulterRow[] = behind
    .map(({ tenant, aging }) => {
      const placement = placementOf(placements, tenant.id);
      return {
        ...aging,
        tenantId: tenant.id,
        displayName: tenantDisplayName(tenant),
        contactName: tenant.business_name ? tenant.name : null,
        phone: tenant.phone,
        propertyName: placement.propertyName,
        unitCodes: placement.unitCodes,
        movedOut: tenant.status === "inactive",
        monthlyRent: placement.monthlyRent,
        lastPaymentDate: lastPaid.get(tenant.id) ?? null,
      };
    })
    .sort(compareAging);

  return {
    asOfMonth: addMonthsToKey(todayMonthKey, -1),
    totalOutstanding: round2(rows.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    groups: agingGroups(rows),
    rows,
  };
}

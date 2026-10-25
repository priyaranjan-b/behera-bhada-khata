import "server-only";
import type { DashboardSummary, DefaulterRow, DefaultersReport } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, yearMonthOf } from "@/lib/dates";
import {
  agingGroups,
  agingOf,
  buildBillingCollectionTrend,
  buildMonthlyReport,
  compareAging,
} from "@/lib/domain/reports";
import { buildAttention, buildKindBreakdown, buildSiteCollection, rentReviewDue } from "@/lib/domain/overview";
import { isVacant } from "@/lib/domain/houses";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { RentPeriod, Tenant } from "@/lib/types";
import { tenantMessagingEnabled } from "@/server/env";
import { ownerDb } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import type { OwnerContext } from "./context";
import { billedTenantIds, ensureRentPeriodsFor } from "./periods";
import { holdsUnit, loadPlacements, placementOf } from "./placements";

const TREND_MONTHS = 6;
/** How many defaulters the Overview lists (the Defaulters page has them all). */
const TOP_DEFAULTERS = 5;

/** `month` is yyyy-MM; anything else means the current month. */
function parseMonth(month?: string | null): string {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return `${month}-01`;
  return currentMonthKey();
}

function groupPeriods(periods: RentPeriod[]): Map<string, RentPeriod[]> {
  const byTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    const list = byTenant.get(period.tenant_id) ?? [];
    list.push(period);
    byTenant.set(period.tenant_id, list);
  }
  return byTenant;
}

/** A house code's site: "AC-T1-G01" -> "AC". */
const siteOf = (code: string) => code.split("-")[0];

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
  const billedIds = new Set(billedTenantIds(allTenants));
  await ensureRentPeriodsFor([...billedIds]);

  const tenantIds = allTenants.map((t) => t.id);
  const [periods, payments, adjustments, placements, units, occupancy, locations, withDocuments] = await Promise.all([
    db.rentPeriods.listForTenants(tenantIds, { openOrFrom: fromMonth }),
    db.payments.listForTenants(tenantIds, { status: "confirmed", fromDate: trendMonthKeys[0] }),
    db.adjustments.listForTenants(tenantIds, { status: "confirmed", fromDate: trendMonthKeys[0] }),
    loadPlacements(db, tenantIds),
    db.units.list(),
    db.occupancy.list(),
    db.locations.list(),
    db.tenantDocuments.tenantIdsWithDocuments(),
  ]);
  const periodsByTenant = groupPeriods(periods);

  // Current tenants, plus former ones who still owe - arrears don't vanish
  // when someone moves out.
  const owes = (id: string) =>
    (periodsByTenant.get(id) ?? []).some((p) => Number(p.amount_due) > Number(p.amount_allocated));
  // Drafts and untracked government tenants (0016) aren't billed, so they never owe.
  const tenants = allTenants.filter((t) => billedIds.has(t.id) || owes(t.id));

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
  const rowOf = new Map(report.rows.map((r) => [r.tenantId, r]));

  const trend = buildBillingCollectionTrend(
    periods,
    payments,
    adjustments,
    trendMonthKeys.map(yearMonthOf)
  );

  // Same rule as the Houses page's "Vacant" filter: in use, nobody holding it today.
  const held = new Set(occupancy.filter((o) => holdsUnit(o)).map((o) => o.unit_code));
  const inUse = units.filter((u) => u.is_active);
  const houses = {
    total: inUse.length,
    vacant: inUse.filter((u) => isVacant({ isActive: u.is_active, occupied: held.has(u.unit_code) })).length,
  };

  const sites = buildSiteCollection(
    locations.map((l) => ({ code: l.location_code, name: l.name })),
    report.rows.map((r) => ({ ...r, siteCodes: placementOf(placements, r.tenantId).unitCodes.map(siteOf) }))
  );

  const active = allTenants.filter((t) => t.status === "active");
  const kinds = buildKindBreakdown(
    allTenants
      .filter((t) => t.status === "active" || rowOf.has(t.id))
      .map((t) => {
        const row = rowOf.get(t.id);
        return {
          kind: t.tenant_kind,
          current: t.status === "active",
          rentTracked: t.rent_tracked,
          monthlyRent: placementOf(placements, t.id).monthlyRent,
          monthDue: row?.monthDue ?? 0,
          monthAllocated: row?.monthAllocated ?? 0,
          totalOutstanding: row?.totalOutstanding ?? 0,
          overdueMonths: row?.overdueMonths ?? 0,
        };
      })
  );

  const named = (list: Tenant[]) => list.map((t) => ({ tenantId: t.id, displayName: tenantDisplayName(t) }));
  const hasDocuments = new Set(withDocuments);
  const unacknowledged = new Set(payments.filter((p) => !p.acknowledged_at).map((p) => p.tenant_id));
  const attention = buildAttention({
    drafts: named(allTenants.filter((t) => t.status === "draft")),
    noDocuments: named(active.filter((t) => !hasDocuments.has(t.id))),
    // Acknowledging needs the tenant to get a link: pointless to chase while Twilio is off.
    unacknowledged: tenantMessagingEnabled() ? named(allTenants.filter((t) => unacknowledged.has(t.id))) : [],
    rentReview: named(
      allTenants.filter(
        (t) =>
          billedIds.has(t.id) &&
          rentReviewDue((placements.ratesByTenant.get(t.id) ?? []).map((r) => r.effective_month), todayMonthKey)
      )
    ),
  });

  const portfolio = {
    rentRoll: round2([...billedIds].reduce((sum, id) => sum + placementOf(placements, id).monthlyRent, 0)),
    depositsHeld: round2(
      allTenants.filter((t) => t.status !== "inactive").reduce((sum, t) => sum + Number(t.deposit_amount ?? 0), 0)
    ),
    advancePaid: round2(
      periods.filter((p) => p.period_month > todayMonthKey).reduce((sum, p) => sum + Number(p.amount_allocated), 0)
    ),
    paidDirectRent: round2(kinds.reduce((sum, k) => sum + k.paidDirectRent, 0)),
  };

  const defaulterList = await defaulterRows(db, allTenants, periodsByTenant, todayMonthKey);
  const defaulters = {
    top: defaulterList.slice(0, TOP_DEFAULTERS),
    tenantCount: defaulterList.length,
    totalOutstanding: round2(defaulterList.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    groups: agingGroups(defaulterList),
  };

  return { monthKey, report, trend, houses, defaulters, sites, kinds, attention, portfolio };
}

/**
 * Tenants (current or moved out) with unpaid rent for a month that has ended,
 * most months behind first. `periodsByTenant` must hold at least every unpaid month.
 */
async function defaulterRows(
  db: OwnerRepositories,
  allTenants: Tenant[],
  periodsByTenant: Map<string, RentPeriod[]>,
  todayMonthKey: string
): Promise<DefaulterRow[]> {
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

  return behind
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
}

/**
 * Every tenant (current or moved out) with unpaid rent for a month that has
 * ended, most months behind first.
 */
export async function getDefaultersReport(_ctx: OwnerContext): Promise<DefaultersReport> {
  const todayMonthKey = currentMonthKey();
  const db = await ownerDb();
  const allTenants = await db.tenants.list();
  await ensureRentPeriodsFor(billedTenantIds(allTenants));

  const periods = await db.rentPeriods.listForTenants(
    allTenants.map((t) => t.id),
    { openOnly: true }
  );
  const rows = await defaulterRows(db, allTenants, groupPeriods(periods), todayMonthKey);

  return {
    asOfMonth: addMonthsToKey(todayMonthKey, -1),
    totalOutstanding: round2(rows.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    groups: agingGroups(rows),
    rows,
  };
}

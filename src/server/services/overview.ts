import "server-only";
import type { HouseCounts, OverviewMonth, OverviewTrend, PortfolioFacts } from "@/lib/contracts";
import { currentMonthKey, monthKeyFromParam, yearMonthOf } from "@/lib/dates";
import { buildBillingCollectionTrend, buildMonthlyReport } from "@/lib/domain/reports";
import {
  buildAttention,
  buildKindBreakdown,
  buildSiteCollection,
  rentReviewDue,
  type AttentionItem,
} from "@/lib/domain/overview";
import { isVacant } from "@/lib/domain/houses";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { RentPeriod, Tenant } from "@/lib/types";
import { tenantMessagingEnabled } from "@/server/env";
import type { OwnerContext } from "./context";
import {
  billedTenants,
  db,
  periodsFrom,
  placements,
  recentAdjustments,
  recentMonthKeys,
  recentPayments,
  recentPeriods,
  tenantsList,
} from "./loaders";
import { showsPaidDirect } from "./paidDirect";
import { billedTenantIds, groupPeriods, paidDirectPeriods } from "./periods";
import { holdsUnit, placementOf, type Placements } from "./placements";

// The Overview is several independent sections, each streamed into its own
// card (A12). Shared reads come from ./loaders (cached per render); within a
// section every read starts at once - nothing waits for a read it doesn't use.


/** Government rent paid direct (A11) for `months`, or none when hidden. */
function directPeriods(
  tenants: Tenant[],
  placement: Placements,
  months: string[],
  show: boolean
): RentPeriod[] {
  return show ? paidDirectPeriods(tenants, placement.ratesByTenant, months) : [];
}

/** A house code's site: "AC-T1-G01" -> "AC". */
const siteOf = (code: string) => code.split("-")[0];

/** The selected month (`yyyy-MM`, default last month): per tenant, per site, per tenant type. */
export async function getOverviewMonth(
  _ctx: OwnerContext,
  month?: string | null,
  options: { paidDirect?: unknown } = {}
): Promise<OverviewMonth> {
  const monthKey = monthKeyFromParam(month);
  const showPaidDirect = showsPaidDirect(options);
  const todayMonthKey = currentMonthKey();
  const fromMonth = recentMonthKeys()[0];
  const [allTenants, stored, placement, locations] = await Promise.all([
    billedTenants(),
    // The shared query whenever the month is inside the recent window (the usual case).
    monthKey < fromMonth ? periodsFrom(monthKey) : recentPeriods(),
    placements(),
    db().then((repos) => repos.locations.list()),
  ]);

  const billedIds = new Set(billedTenantIds(allTenants));
  const direct = directPeriods(allTenants, placement, [monthKey], showPaidDirect);
  const directIds = new Set(direct.map((p) => p.tenant_id));
  const periodsByTenant = groupPeriods([...stored, ...direct]);

  // Current tenants, plus former ones who still owe - arrears don't vanish
  // when someone moves out. Drafts and untracked government tenants (0016)
  // aren't billed, so they never owe.
  const owes = (id: string) =>
    (periodsByTenant.get(id) ?? []).some((p) => Number(p.amount_due) > Number(p.amount_allocated));
  const tenants = allTenants.filter((t) => billedIds.has(t.id) || directIds.has(t.id) || owes(t.id));

  const report = buildMonthlyReport(
    tenants.map((t) => ({
      id: t.id,
      name: tenantDisplayName(t),
      propertyName: placementOf(placement, t.id).propertyName,
      movedOut: t.status === "inactive",
    })),
    periodsByTenant,
    monthKey,
    todayMonthKey
  );
  const rowOf = new Map(report.rows.map((r) => [r.tenantId, r]));

  const sites = buildSiteCollection(
    locations.map((l) => ({ code: l.location_code, name: l.name })),
    report.rows.map((r) => ({ ...r, siteCodes: placementOf(placement, r.tenantId).unitCodes.map(siteOf) }))
  );

  const kinds = buildKindBreakdown(
    allTenants
      .filter((t) => t.status === "active" || rowOf.has(t.id))
      .map((t) => {
        const row = rowOf.get(t.id);
        return {
          kind: t.tenant_kind,
          current: t.status === "active",
          rentTracked: t.rent_tracked,
          monthlyRent: placementOf(placement, t.id).monthlyRent,
          monthDue: row?.monthDue ?? 0,
          monthAllocated: row?.monthAllocated ?? 0,
          totalOutstanding: row?.totalOutstanding ?? 0,
          overdueMonths: row?.overdueMonths ?? 0,
        };
      }),
    { paidDirect: showPaidDirect }
  );

  return { monthKey, report, sites, kinds };
}

/** Billed vs collected over the recent window, government rent paid direct included unless hidden. */
export async function getOverviewTrend(_ctx: OwnerContext, options: { paidDirect?: unknown } = {}): Promise<OverviewTrend> {
  const showPaidDirect = showsPaidDirect(options);
  const months = recentMonthKeys();
  const todayMonthKey = currentMonthKey();
  const [allTenants, stored, placement, recorded, adjustments] = await Promise.all([
    billedTenants(),
    recentPeriods(),
    placements(),
    recentPayments(),
    recentAdjustments(),
  ]);
  // Paid-direct months count as billed and as collected that month (A11).
  const direct = directPeriods(allTenants, placement, months, showPaidDirect);
  const payments = [
    ...recorded,
    ...direct
      .filter((p) => p.period_month <= todayMonthKey)
      .map((p) => ({ amount: p.amount_allocated, payment_date: p.period_month })),
  ];
  return {
    trend: buildBillingCollectionTrend([...stored, ...direct], payments, adjustments, months.map(yearMonthOf)),
  };
}

/** Same rule as the Houses page's "Vacant" filter: in use, nobody holding it today. */
export async function getHouseCounts(_ctx: OwnerContext): Promise<HouseCounts> {
  const repos = await db();
  const [units, occupancy] = await Promise.all([repos.units.list(), repos.occupancy.list()]);
  const held = new Set(occupancy.filter((o) => holdsUnit(o)).map((o) => o.unit_code));
  const inUse = units.filter((u) => u.is_active);
  return {
    total: inUse.length,
    vacant: inUse.filter((u) => isVacant({ isActive: u.is_active, occupied: held.has(u.unit_code) })).length,
  };
}

/** Loose ends to tidy: drafts, missing documents, unsigned receipts, rents due a review. */
export async function getAttention(_ctx: OwnerContext): Promise<AttentionItem[]> {
  const [allTenants, placement, recorded, withDocuments] = await Promise.all([
    tenantsList(),
    placements(),
    recentPayments(),
    db().then((repos) => repos.tenantDocuments.tenantIdsWithDocuments()),
  ]);
  const todayMonthKey = currentMonthKey();
  const billedIds = new Set(billedTenantIds(allTenants));
  const named = (list: Tenant[]) => list.map((t) => ({ tenantId: t.id, displayName: tenantDisplayName(t) }));
  const hasDocuments = new Set(withDocuments);
  const unacknowledged = new Set(recorded.filter((p) => !p.acknowledged_at).map((p) => p.tenant_id));
  return buildAttention({
    drafts: named(allTenants.filter((t) => t.status === "draft")),
    noDocuments: named(allTenants.filter((t) => t.status === "active" && !hasDocuments.has(t.id))),
    // Acknowledging needs the tenant to get a link: pointless to chase while Twilio is off.
    unacknowledged: tenantMessagingEnabled() ? named(allTenants.filter((t) => unacknowledged.has(t.id))) : [],
    rentReview: named(
      allTenants.filter(
        (t) =>
          billedIds.has(t.id) &&
          rentReviewDue((placement.ratesByTenant.get(t.id) ?? []).map((r) => r.effective_month), todayMonthKey)
      )
    ),
  });
}

/** Standing facts: rent roll, deposits, rent paid in advance, government rent paid direct. */
export async function getPortfolio(_ctx: OwnerContext, options: { paidDirect?: unknown } = {}): Promise<PortfolioFacts> {
  const showPaidDirect = showsPaidDirect(options);
  const todayMonthKey = currentMonthKey();
  const [allTenants, placement, stored] = await Promise.all([
    billedTenants(),
    placements(),
    // Months after this one are always in the recent window's query.
    recentPeriods(),
  ]);
  const billedIds = new Set(billedTenantIds(allTenants));
  const rentOf = (list: Tenant[]) => round2(list.reduce((sum, t) => sum + placementOf(placement, t.id).monthlyRent, 0));
  const direct = showPaidDirect ? allTenants.filter((t) => t.status === "active" && !t.rent_tracked) : [];
  return {
    // Everyone who pays rent now, government rent paid direct included unless hidden.
    rentRoll: rentOf([...allTenants.filter((t) => billedIds.has(t.id)), ...direct]),
    depositsHeld: round2(
      allTenants.filter((t) => t.status !== "inactive").reduce((sum, t) => sum + Number(t.deposit_amount ?? 0), 0)
    ),
    advancePaid: round2(
      stored.filter((p) => p.period_month > todayMonthKey).reduce((sum, p) => sum + Number(p.amount_allocated), 0)
    ),
    paidDirectRent: rentOf(direct),
  };
}


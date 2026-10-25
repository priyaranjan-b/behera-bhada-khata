import "server-only";
import { cache } from "react";
import type { HouseCounts, OverviewMonth, OverviewTrend, PortfolioFacts } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, monthKeyFromParam, yearMonthOf } from "@/lib/dates";
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
import { paidDirectViewSchema } from "@/lib/validation";
import { tenantMessagingEnabled } from "@/server/env";
import { ownerDb } from "@/server/infra";
import type { OwnerContext } from "./context";
import { billedTenantIds, ensureRentPeriodsFor, groupPeriods, paidDirectPeriods, paidDirectTenants } from "./periods";
import { holdsUnit, loadPlacements, placementOf } from "./placements";

// The Overview is several independent sections, each streamed into its own
// card (A12). They share the reads below through React `cache()`: within one
// page render every section gets the same promise, so the tenant list, the
// `ensure_rent_periods` write and the rent months run once. Outside a render
// (a route handler, a test) `cache` is a plain call. Section functions read
// shared data only through these loaders, never with their own `db.*` calls.

const TREND_MONTHS = 6;

/** The trend window: the last TREND_MONTHS month keys, ending this month. */
function trendMonthKeys(): string[] {
  const today = currentMonthKey();
  return Array.from({ length: TREND_MONTHS }, (_, i) => addMonthsToKey(today, i - (TREND_MONTHS - 1)));
}

const tenantsList = cache(async (): Promise<Tenant[]> => (await ownerDb()).tenants.list());

/** Every tenant, after topping up the rent months of the billed ones. */
export const billedTenants = cache(async (): Promise<Tenant[]> => {
  const tenants = await tenantsList();
  await ensureRentPeriodsFor(billedTenantIds(tenants));
  return tenants;
});

const placements = cache(async () => loadPlacements(await ownerDb(), (await tenantsList()).map((t) => t.id)));

/** Unpaid rent months (for balances) plus every month from `fromMonth`. */
const periodsFrom = cache(async (fromMonth: string): Promise<RentPeriod[]> => {
  const tenants = await billedTenants();
  return (await ownerDb()).rentPeriods.listForTenants(
    tenants.map((t) => t.id),
    { openOrFrom: fromMonth }
  );
});

/** Confirmed payments dated from the start of the trend window. */
const recentPayments = cache(async () =>
  (await ownerDb()).payments.listForTenants(
    (await tenantsList()).map((t) => t.id),
    { status: "confirmed", fromDate: trendMonthKeys()[0] }
  )
);

/** Government rent paid direct (A11) for `months`, or none when hidden. */
function directPeriods(
  tenants: Tenant[],
  placement: Awaited<ReturnType<typeof placements>>,
  months: string[],
  show: boolean
): RentPeriod[] {
  return show ? paidDirectPeriods(tenants, placement.ratesByTenant, months) : [];
}

/** A house code's site: "AC-T1-G01" -> "AC". */
const siteOf = (code: string) => code.split("-")[0];

/** The selected month (`yyyy-MM`, default this month): per tenant, per site, per tenant type. */
export async function getOverviewMonth(
  _ctx: OwnerContext,
  month?: string | null,
  options: { paidDirect?: unknown } = {}
): Promise<OverviewMonth> {
  const monthKey = monthKeyFromParam(month);
  const showPaidDirect = paidDirectViewSchema.parse(options.paidDirect) === "show";
  const todayMonthKey = currentMonthKey();
  // Same key as the trend's whenever the month is inside its window, so both share one query.
  const fromMonth = [monthKey, trendMonthKeys()[0]].sort()[0];
  const [allTenants, stored, placement, db] = await Promise.all([
    billedTenants(),
    periodsFrom(fromMonth),
    placements(),
    ownerDb(),
  ]);
  const locations = await db.locations.list();

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

  const paidDirect = { available: paidDirectTenants(allTenants).length > 0, shown: showPaidDirect };
  return { monthKey, report, sites, kinds, paidDirect };
}

/** Billed vs collected for the last TREND_MONTHS months, government rent paid direct included unless hidden. */
export async function getOverviewTrend(_ctx: OwnerContext, options: { paidDirect?: unknown } = {}): Promise<OverviewTrend> {
  const showPaidDirect = paidDirectViewSchema.parse(options.paidDirect) === "show";
  const months = trendMonthKeys();
  const todayMonthKey = currentMonthKey();
  const db = await ownerDb();
  const [allTenants, stored, placement, recorded] = await Promise.all([
    billedTenants(),
    periodsFrom(months[0]),
    placements(),
    recentPayments(),
  ]);
  const adjustments = await db.adjustments.listForTenants(
    allTenants.map((t) => t.id),
    { status: "confirmed", fromDate: months[0] }
  );
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
  const db = await ownerDb();
  const [units, occupancy] = await Promise.all([db.units.list(), db.occupancy.list()]);
  const held = new Set(occupancy.filter((o) => holdsUnit(o)).map((o) => o.unit_code));
  const inUse = units.filter((u) => u.is_active);
  return {
    total: inUse.length,
    vacant: inUse.filter((u) => isVacant({ isActive: u.is_active, occupied: held.has(u.unit_code) })).length,
  };
}

/** Loose ends to tidy: drafts, missing documents, unsigned receipts, rents due a review. */
export async function getAttention(_ctx: OwnerContext): Promise<AttentionItem[]> {
  const db = await ownerDb();
  const [allTenants, placement, recorded, withDocuments] = await Promise.all([
    tenantsList(),
    placements(),
    recentPayments(),
    db.tenantDocuments.tenantIdsWithDocuments(),
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
  const showPaidDirect = paidDirectViewSchema.parse(options.paidDirect) === "show";
  const todayMonthKey = currentMonthKey();
  const [allTenants, placement, stored] = await Promise.all([
    billedTenants(),
    placements(),
    // Months after this one are always inside the trend window's query.
    periodsFrom(trendMonthKeys()[0]),
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

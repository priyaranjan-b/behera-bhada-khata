import "server-only";
import type { BillingPayment, BillingReceived, BillingReport, BillingRow } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { billingTotals, isPaidDirect, monthsIn, resolveRange, type MonthRange } from "@/lib/domain/billing";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import { BILLING_LIMITS, billingQuerySchema } from "@/lib/validation";
import { parseInput, type OwnerContext } from "./context";
import { billedTenants, db, paymentsFrom, placements, tenantsList } from "./loaders";
import { paidDirectPeriods } from "./periods";
import { placementOf } from "./placements";

// The Billing page loads in sections (A12): the months (rows + totals, one
// set of rows) and the cash received in the range (a different query). Both
// read through ./loaders, so in one render they share the tenant list,
// placements and the range's payments. The paid-direct switch is its own
// call (./paidDirect).

/** `?from&to&paidDirect` -> the range (default: this month, the latest that has fallen due) and the view. */
function parseQuery(query: unknown): { range: MonthRange; latestMonth: string; showPaidDirect: boolean } {
  const input = parseInput(billingQuerySchema, query ?? {});
  const latestMonth = currentMonthKey();
  return {
    range: resolveRange(input, latestMonth, BILLING_LIMITS.maxMonths),
    latestMonth,
    showPaidDirect: input.paidDirect === "show",
  };
}

/**
 * Rent billed per tenant per month over a range of months, what was paid
 * towards each month and by which receipts, and the range's totals.
 */
export async function getBillingReport(_ctx: OwnerContext, query: unknown = {}): Promise<BillingReport> {
  const { range, latestMonth, showPaidDirect } = parseQuery(query);
  const [allTenants, placement, rangePayments, repos] = await Promise.all([
    billedTenants(),
    placements(),
    paymentsFrom(range.from),
    db(),
  ]);
  const stored = await repos.rentPeriods.listForTenants(
    allTenants.map((t) => t.id),
    { months: range }
  );
  const allocations = await repos.payments.listAllocationsForPeriods(stored.map((p) => p.id));
  // Government rent paid to the owner directly: billed and collected each month (A11).
  const direct = showPaidDirect ? paidDirectPeriods(allTenants, placement.ratesByTenant, monthsIn(range)) : [];
  const periods = [...stored, ...direct];

  // Payments made before the range can still have paid for its months (in
  // advance); fetch just those, by id, together.
  const known = new Map(rangePayments.map((p) => [p.id, p]));
  const earlier = [...new Set(allocations.map((a) => a.payment_id))].filter((id) => !known.has(id));
  for (const payment of await Promise.all(earlier.map((id) => repos.payments.get(id)))) {
    if (payment) known.set(payment.id, payment);
  }

  const paymentsByPeriod = new Map<string, BillingPayment[]>();
  for (const a of allocations) {
    const payment = known.get(a.payment_id);
    if (!payment || payment.status !== "confirmed") continue;
    const list = paymentsByPeriod.get(a.rent_period_id) ?? [];
    list.push({
      paymentId: payment.id,
      receiptNo: payment.receipt_no,
      paymentDate: payment.payment_date,
      mode: payment.mode,
      amount: Number(a.amount_allocated),
    });
    paymentsByPeriod.set(a.rent_period_id, list);
  }

  const tenantsById = new Map(allTenants.map((t) => [t.id, t]));
  const rows: BillingRow[] = periods.map((p) => {
    const tenant = tenantsById.get(p.tenant_id);
    const place = placementOf(placement, p.tenant_id);
    const amountDue = Number(p.amount_due);
    const amountAllocated = Number(p.amount_allocated);
    return {
      id: p.id,
      tenantId: p.tenant_id,
      tenantName: tenant ? tenantDisplayName(tenant) : "—",
      propertyName: place.propertyName,
      unitCodes: place.unitCodes,
      periodMonth: p.period_month,
      monthLabel: formatMonth(p.period_month),
      amountDue,
      amountAllocated,
      balance: round2(Math.max(0, amountDue - amountAllocated)),
      status: p.status,
      notYetDue: p.period_month >= latestMonth,
      payments: (paymentsByPeriod.get(p.id) ?? []).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)),
      paidDirect: isPaidDirect(p.id),
    };
  });

  return { from: range.from, to: range.to, latestMonth, rows, totals: billingTotals(rows) };
}

/**
 * Cash view: money that arrived in the range's calendar months, whatever
 * months it paid for - recorded payments, plus government rent paid direct
 * for those months up to this one (A11) unless hidden.
 */
export async function getBillingReceived(_ctx: OwnerContext, query: unknown = {}): Promise<BillingReceived> {
  const { range, latestMonth, showPaidDirect } = parseQuery(query);
  const [allTenants, placement, rangePayments] = await Promise.all([
    tenantsList(),
    placements(),
    paymentsFrom(range.from),
  ]);
  const afterRange = addMonthsToKey(range.to, 1);
  const inRange = rangePayments.filter((p) => monthKeyOf(p.payment_date) < afterRange);
  const direct = showPaidDirect ? paidDirectPeriods(allTenants, placement.ratesByTenant, monthsIn(range)) : [];
  const paidDirect = round2(
    direct.filter((p) => p.period_month <= latestMonth).reduce((sum, p) => sum + Number(p.amount_allocated), 0)
  );
  const recorded = inRange.reduce((sum, p) => sum + Number(p.amount), 0);
  return { amount: round2(recorded + paidDirect), payments: inRange.length, paidDirect };
}

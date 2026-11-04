import "server-only";
import type { EarningsView } from "@/lib/contracts";
import { currentMonthKey, monthKeyOf, yearMonthOf } from "@/lib/dates";
import { monthsIn } from "@/lib/domain/billing";
import { buildEarnings, earningsRange, earningsTotals } from "@/lib/domain/earnings";
import { cashOnly } from "@/lib/domain/payments";
import { EARNINGS_LIMITS, earningsQuerySchema } from "@/lib/validation";
import { parseInput, type OwnerContext } from "./context";
import { adjustmentsFrom, billedTenants, db, paymentsFrom, periodsFrom, placements } from "./loaders";
import { paidDirectPeriods } from "./periods";

// Effective earning per month (A23): rent collected or cash received, less
// maintenance. One call: the cards, the chart and the table are the same
// months. Government rent paid direct counts as billed, collected and
// received in its own month (A11) unless hidden, as on Billing and the Overview.

/** The months asked for (default: the last 12, ending this month) and the paid-direct view. */
export async function getEarnings(_ctx: OwnerContext, query: unknown = {}): Promise<EarningsView> {
  const input = parseInput(earningsQuerySchema, query ?? {});
  const thisMonth = currentMonthKey();
  const range = earningsRange(input, EARNINGS_LIMITS);
  const months = monthsIn(range);
  const showPaidDirect = input.paidDirect === "show";

  const [tenants, stored, placement, payments, adjustments, maintenance] = await Promise.all([
    billedTenants(),
    periodsFrom(range.from),
    placements(),
    paymentsFrom(range.from),
    adjustmentsFrom(range.from),
    db().then((repos) => repos.maintenance.monthly(range.from, range.to)),
  ]);
  // Unpaid months before the range come with periodsFrom; only the range counts here.
  const inRange = stored.filter((p) => p.period_month >= range.from && p.period_month <= range.to);
  const direct = showPaidDirect ? paidDirectPeriods(tenants, placement.ratesByTenant, months) : [];
  const cashPayments = [
    ...cashOnly(payments),
    // Paid-direct rent arrives in its own month, up to this one (A11).
    ...direct.filter((p) => p.period_month <= thisMonth).map((p) => ({ amount: p.amount_allocated, payment_date: p.period_month })),
  ].filter((p) => monthKeyOf(p.payment_date) <= range.to);

  const rows = buildEarnings({
    monthKeys: months.map(yearMonthOf),
    periods: [...inRange, ...direct],
    cashPayments,
    adjustments,
    maintenance,
  });
  return { from: range.from, to: range.to, months: rows, totals: earningsTotals(rows) };
}

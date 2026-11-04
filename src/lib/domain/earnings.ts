import { addMonthsToKey, currentMonthKey, formatMonth, yearMonthOf } from "@/lib/dates";
import { rangeFromParams, type MonthRange } from "./billing";
import { round2 } from "@/lib/money";
import { buildBillingCollectionTrend } from "./reports";

// Effective earning (A23): what the rent book brings in each month once
// maintenance is paid. Two views, as the Overview keeps them apart (A20):
// - Net (rent month) = rent collected for that month's rent - every
//   maintenance expense dated that month. "Did this month's rent cover the
//   upkeep?"
// - Net cash = cash received in the month - maintenance paid in cash that
//   month. "What did I actually keep?" A set-off (A22) is in neither side:
//   no money came in for it, and an expense it paid for cost no cash.
// Client-safe and pure; the service gathers the rows.

/**
 * The months a request or page URL asks for (`from`/`to` yyyy-MM, malformed
 * ones ignored, at most `maxMonths`), or with neither the last
 * `defaultMonths` ending this month.
 */
export function earningsRange(
  params: { from?: string; to?: string },
  limits: { maxMonths: number; defaultMonths: number },
  now: Date = new Date()
): MonthRange {
  const thisMonth = currentMonthKey(now);
  const asked = rangeFromParams(params, "", limits.maxMonths);
  if (!asked.from) return { from: addMonthsToKey(thisMonth, 1 - limits.defaultMonths), to: thisMonth };
  return asked;
}

export interface EarningsMonth {
  /** yyyy-MM. */
  monthKey: string;
  /** "Oct 2026". */
  label: string;
  billed: number;
  /** Credited to this month's rent (amount_allocated), whenever paid. */
  collected: number;
  /** Cash received in the month (A20), set-offs excluded (A22). */
  received: number;
  /** Every maintenance expense dated in the month, voided ones excluded. */
  maintenance: number;
  /** Of it, paid in cash (not by a set-off, A22). */
  maintenanceCash: number;
  /** collected - maintenance. */
  netCollected: number;
  /** received - maintenanceCash. */
  netCash: number;
  /** maintenance / collected, as a whole percentage; null with nothing collected. */
  expenseRatio: number | null;
}

export type EarningsTotals = Omit<EarningsMonth, "monthKey" | "label">;

export interface EarningsInput {
  /** yyyy-MM keys, oldest first. */
  monthKeys: string[];
  /** Rent months (stored and paid-direct) with what is due and credited. */
  periods: { period_month: string; amount_due: number; amount_allocated: number }[];
  /** Cash payments only (cashOnly), plus paid-direct rent as received in its month. */
  cashPayments: { amount: number; payment_date: string }[];
  adjustments: { delta_amount: number; confirmed_at: string | null }[];
  /** Maintenance per month (yyyy-MM-01 or yyyy-MM), voided excluded. */
  maintenance: { month: string; amount: number; cash: number }[];
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** One row per month, oldest first. */
export function buildEarnings(input: EarningsInput): EarningsMonth[] {
  // Billed per rent month and cash received per month, as the Overview's chart counts them.
  const trend = buildBillingCollectionTrend(input.periods, input.cashPayments, input.adjustments, input.monthKeys);
  const collected = new Map<string, number>();
  for (const p of input.periods) {
    const key = yearMonthOf(p.period_month);
    collected.set(key, round2((collected.get(key) ?? 0) + Number(p.amount_allocated)));
  }
  const spent = new Map<string, { amount: number; cash: number }>();
  for (const m of input.maintenance) {
    const key = yearMonthOf(m.month);
    const sum = spent.get(key) ?? { amount: 0, cash: 0 };
    spent.set(key, { amount: round2(sum.amount + m.amount), cash: round2(sum.cash + m.cash) });
  }
  return trend.map((point) => {
    const rentCollected = collected.get(point.monthKey) ?? 0;
    const maintenance = spent.get(point.monthKey) ?? { amount: 0, cash: 0 };
    return {
      monthKey: point.monthKey,
      label: formatMonth(point.monthKey, "short"),
      billed: point.billed,
      collected: rentCollected,
      received: point.collected,
      maintenance: maintenance.amount,
      maintenanceCash: maintenance.cash,
      netCollected: round2(rentCollected - maintenance.amount),
      netCash: round2(point.collected - maintenance.cash),
      expenseRatio: ratio(maintenance.amount, rentCollected),
    };
  });
}

/** The months added up; the ratio is of the totals, not an average of months. */
export function earningsTotals(months: EarningsMonth[]): EarningsTotals {
  const sum = (pick: (m: EarningsMonth) => number) => round2(months.reduce((s, m) => s + pick(m), 0));
  const collected = sum((m) => m.collected);
  const maintenance = sum((m) => m.maintenance);
  return {
    billed: sum((m) => m.billed),
    collected,
    received: sum((m) => m.received),
    maintenance,
    maintenanceCash: sum((m) => m.maintenanceCash),
    netCollected: sum((m) => m.netCollected),
    netCash: sum((m) => m.netCash),
    expenseRatio: ratio(maintenance, collected),
  };
}

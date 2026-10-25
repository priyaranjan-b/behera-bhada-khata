import { addMonthsToKey, monthKeyOf, monthsBetween, yearMonthOf } from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { PeriodStatus } from "@/lib/types";

// The Billing page: a range of rent months and what was collected for them.
// Ranges are month keys (yyyy-MM-01), both ends included.

export interface MonthRange {
  from: string;
  to: string;
}

/** How many months a range spans (1 for a single month). */
export function rangeLength(range: MonthRange): number {
  return monthsBetween(range.from, range.to) + 1;
}

/**
 * The range a request asks for: `from`/`to` are yyyy-MM (either may be
 * missing; one alone is a single month). Reversed ends are swapped, and a
 * range longer than `maxMonths` keeps its start. No input = `defaultMonth`.
 */
export function resolveRange(
  input: { from?: string; to?: string },
  defaultMonth: string,
  maxMonths: number
): MonthRange {
  const from = input.from ? monthKeyOf(input.from) : null;
  const to = input.to ? monthKeyOf(input.to) : null;
  let range: MonthRange = { from: from ?? to ?? defaultMonth, to: to ?? from ?? defaultMonth };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  if (rangeLength(range) > maxMonths) range = { from: range.from, to: addMonthsToKey(range.from, maxMonths - 1) };
  return range;
}

/** The same-length range just before (-1) or after (+1): what the ‹ › arrows open. */
export function shiftRange(range: MonthRange, direction: -1 | 1): MonthRange {
  const step = rangeLength(range) * direction;
  return { from: addMonthsToKey(range.from, step), to: addMonthsToKey(range.to, step) };
}

/** `?from=&to=` values (yyyy-MM) for a range, as the page URL carries them. */
export function rangeQuery(range: MonthRange): { from: string; to: string } {
  return { from: yearMonthOf(range.from), to: yearMonthOf(range.to) };
}

/**
 * A rent month's status as shown: a month that hasn't ended and isn't fully
 * paid is "not due yet" rather than unpaid (same rule as summarizeBalance).
 */
export function periodDisplayStatus(status: PeriodStatus, notYetDue: boolean): PeriodStatus | "not_due_yet" {
  return notYetDue && status !== "paid" ? "not_due_yet" : status;
}

export interface BillingTotals {
  /** Rent billed for the months in the range. */
  billed: number;
  /** Paid towards those months, whenever it was paid. */
  collected: number;
  /** Still owed on those months. */
  balance: number;
  /** The part of `balance` on months that have ended (overdue). */
  overdue: number;
  /** Collected as a % of billed; null when nothing was billed. */
  collectionRate: number | null;
}

export function billingTotals(
  rows: { amountDue: number; amountAllocated: number; notYetDue: boolean }[]
): BillingTotals {
  let billed = 0;
  let collected = 0;
  let overdue = 0;
  for (const r of rows) {
    billed += r.amountDue;
    collected += r.amountAllocated;
    if (!r.notYetDue) overdue += Math.max(0, r.amountDue - r.amountAllocated);
  }
  return {
    billed: round2(billed),
    collected: round2(collected),
    balance: round2(Math.max(0, billed - collected)),
    overdue: round2(overdue),
    collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : null,
  };
}

// ---- Rent paid to the owner directly (government agreements, 0016) -------------
//
// A government tenant whose rent isn't tracked pays the owner's bank on time
// every month. Its agreement rent counts as billed and collected for each
// month it holds its houses: computed, never stored, so it can't fall into
// arrears and no payment needs entering (see A11 in docs/design-decisions.md).

const PAID_DIRECT_PREFIX = "paid-direct:";

/** Id of a computed paid-direct month, so it can never clash with a rent_periods uuid. */
export function paidDirectId(tenantId: string, monthKey: string): string {
  return `${PAID_DIRECT_PREFIX}${tenantId}:${monthKey}`;
}

export function isPaidDirect(periodId: string): boolean {
  return periodId.startsWith(PAID_DIRECT_PREFIX);
}

/** Every month key from `from` to `to`, both included. */
export function monthsIn(range: MonthRange): string[] {
  return Array.from({ length: rangeLength(range) }, (_, i) => addMonthsToKey(range.from, i));
}

/**
 * The months (of those given) a paid-direct tenant's rent covers, and the
 * agreement rent in effect for each: from the lease month to the move-out
 * month, never after `throughMonth`, and only while a rent is on file.
 */
export function paidDirectMonths(
  tenant: { leaseStart: string | null; movedOutOn: string | null },
  rates: { effective_month: string; monthly_amount: number | string }[],
  months: string[],
  throughMonth: string
): { month: string; amount: number }[] {
  if (!tenant.leaseStart || rates.length === 0) return [];
  const first = monthKeyOf(tenant.leaseStart);
  const last = tenant.movedOutOn ? monthKeyOf(tenant.movedOutOn) : throughMonth;
  const sorted = [...rates].sort((a, b) => a.effective_month.localeCompare(b.effective_month));
  return [...new Set(months)]
    .filter((m) => m >= first && m <= last && m <= throughMonth)
    .sort()
    .map((month) => {
      const rate = sorted.filter((r) => r.effective_month <= month).pop() ?? sorted[0];
      return { month, amount: round2(Number(rate.monthly_amount)) };
    })
    .filter((m) => m.amount > 0);
}

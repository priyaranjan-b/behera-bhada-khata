import { addMonthsToKey, isYearMonth, monthKeyOf, monthsBetween, yearMonthOf } from "@/lib/dates";
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

/**
 * The range a page URL asks for (`?from=&to=`), as resolveRange but ignoring
 * malformed values instead of failing: the Billing page shows its header and
 * range straight from the URL, then asks the API for exactly this range.
 */
export function rangeFromParams(
  params: { from?: string; to?: string },
  defaultMonth: string,
  maxMonths: number
): MonthRange {
  return resolveRange(
    { from: isYearMonth(params.from) ? params.from : undefined, to: isYearMonth(params.to) ? params.to : undefined },
    defaultMonth,
    maxMonths
  );
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

// A tenant's Months table (A15): its "Show" choices and what it sorts and
// filters, done by tenant_months_page() in SQL.
export const TENANT_MONTH_SHOWS = ["all", "unpaid", "partly", "paid", "notDue"] as const;
export type TenantMonthShow = (typeof TENANT_MONTH_SHOWS)[number];
export const TENANT_MONTH_SHOW_OPTIONS: { value: TenantMonthShow; label: string }[] = [
  { value: "all", label: "All months" },
  { value: "unpaid", label: "Unpaid (overdue)" },
  { value: "partly", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "notDue", label: "Not due yet" },
];
export const TENANT_MONTH_SORT_FIELDS = ["periodMonth", "amountDue", "amountAllocated", "status"] as const;
export const TENANT_MONTH_FILTER_FIELDS = ["periodMonth", "status"] as const;

// The Billing grid (A15): its "Show" choices and what it sorts and filters,
// done by billing_page() in SQL.
export const BILLING_SHOWS = ["all", "unpaid", "partly", "paid", "paidDirect", "notDue"] as const;
export type BillingShow = (typeof BILLING_SHOWS)[number];
export const BILLING_SHOW_OPTIONS: { value: BillingShow; label: string }[] = [
  { value: "all", label: "All months" },
  { value: "unpaid", label: "Unpaid (overdue)" },
  { value: "partly", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "paidDirect", label: "Govt - paid direct" },
  { value: "notDue", label: "Not due yet" },
];
export const BILLING_SORT_FIELDS = ["periodMonth", "tenantName", "amountDue", "amountAllocated", "balance", "status"] as const;
export const BILLING_FILTER_FIELDS = ["periodMonth", "tenantName", "status", "payments"] as const;

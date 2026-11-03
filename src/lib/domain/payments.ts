import {
  addDaysToKey,
  addMonthsToKey,
  daysBetween,
  formatDateKey,
  formatMonth,
  isDateKey,
  lastMonthKey,
  monthDayRange,
  monthKeyOf,
  monthsBetween,
  todayKey,
} from "@/lib/dates";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/types";

/** How each payment mode reads to people: forms, the confirm page and the receipt. */
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

/** For a `<select>`: every mode in display order. */
export const PAYMENT_MODE_OPTIONS = PAYMENT_MODES.map((value) => ({ value, label: PAYMENT_MODE_LABELS[value] }));

export function isPaymentMode(value: string): value is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(value);
}

/** Never shows the raw value (`bank_transfer`); an unknown mode falls back to "Other". */
export function paymentModeLabel(mode: string): string {
  return isPaymentMode(mode) ? PAYMENT_MODE_LABELS[mode] : PAYMENT_MODE_LABELS.other;
}

// ---- The Payments page (0026): payments by the day received ------------------

/** The Payments grid's sortable and filterable columns (queries/paymentsPage.ts). */
export const PAYMENTS_SORT_FIELDS = ["paymentDate", "receiptNo", "tenantName", "mode", "amount"] as const;
export const PAYMENTS_FILTER_FIELDS = ["paymentDate", "receiptNo", "tenantName", "mode", "monthsText", "note"] as const;

/** Days received, both included (yyyy-MM-dd). */
export interface DayRange {
  from: string;
  to: string;
}

/**
 * The days a request asks for: either end alone is a single day, reversed
 * ends are swapped, and a range longer than `maxDays` keeps its start. No
 * input = last month, the latest that has ended.
 */
export function resolveDayRange(input: { from?: string; to?: string }, maxDays: number, now: Date = new Date()): DayRange {
  if (!input.from && !input.to) return monthDayRange(lastMonthKey(now));
  let from = input.from ?? input.to!;
  let to = input.to ?? input.from!;
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) + 1 > maxDays) to = addDaysToKey(from, maxDays - 1);
  return { from, to };
}

/** Whole calendar months: from the 1st of one month to the last day of a month. */
function wholeMonths(range: DayRange): number | null {
  if (range.from !== monthKeyOf(range.from) || monthDayRange(range.to).to !== range.to) return null;
  return monthsBetween(range.from, monthKeyOf(range.to)) + 1;
}

/** The same-length range just before (-1) or after (+1): whole months move by months, other ranges by days. */
export function shiftDayRange(range: DayRange, direction: -1 | 1): DayRange {
  const months = wholeMonths(range);
  if (months) {
    const from = addMonthsToKey(range.from, months * direction);
    return { from, to: monthDayRange(addMonthsToKey(from, months - 1)).to };
  }
  const days = (daysBetween(range.from, range.to) + 1) * direction;
  return { from: addDaysToKey(range.from, days), to: addDaysToKey(range.to, days) };
}

/** "October 2026", "Sep – Oct 2026" for whole months, else "01/10/2026 – 15/10/2026". */
export function dayRangeLabel(range: DayRange): string {
  const months = wholeMonths(range);
  if (months === 1) return formatMonth(range.from);
  if (months) return `${formatMonth(range.from, "short")} – ${formatMonth(range.to, "short")}`;
  return range.from === range.to ? formatDateKey(range.from) : `${formatDateKey(range.from)} – ${formatDateKey(range.to)}`;
}

/** The rent months a range of days touches (month keys), for Govt rent paid direct (A11). */
export function monthsOfDayRange(range: DayRange): { from: string; to: string } {
  return { from: monthKeyOf(range.from), to: monthKeyOf(range.to) };
}

/** The range a page URL asks for (`?from=&to=`), as resolveDayRange but ignoring malformed dates. */
export function dayRangeFromParams(params: { from?: string; to?: string }, maxDays: number, now: Date = new Date()): DayRange {
  const valid = (key: string | undefined) => (key && isDateKey(key) ? key : undefined);
  return resolveDayRange({ from: valid(params.from), to: valid(params.to) }, maxDays, now);
}

/** What the ‹ › arrows move by: "month", "3 months", "7 days". */
export function dayRangeUnit(range: DayRange): string {
  const months = wholeMonths(range);
  if (months) return months === 1 ? "month" : `${months} months`;
  const days = daysBetween(range.from, range.to) + 1;
  return days === 1 ? "day" : `${days} days`;
}

/** The Record payment form's one-tap dates: today and yesterday, in the app time zone. */
export function recentDayPicks(now: Date = new Date()): { label: string; value: string }[] {
  const today = todayKey(now);
  return [
    { label: "Today", value: today },
    { label: "Yesterday", value: addDaysToKey(today, -1) },
  ];
}

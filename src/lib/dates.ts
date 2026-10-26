// Calendar dates in the app's time zone. "Today", "this month" and the month
// a timestamp falls in are what the owner sees on their wall calendar, not
// UTC - a payment logged at 02:00 IST belongs to that day, not the previous
// one. Pure (no "server-only"): the payment form uses it in the browser too.
//
// Keys are strings: a date key is yyyy-MM-dd, a month key is the first of
// the month (yyyy-MM-01), matching rent_periods.period_month.

/** Edit for a different locale - the one place the app's calendar is defined. */
export const APP_TIME_ZONE = "Asia/Kolkata";
export const APP_LOCALE = "en-IN";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** yyyy-MM-dd of an instant, in the app time zone. */
export function dateKeyOf(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA formats as yyyy-MM-dd.
  return keyFormatter.format(d);
}

/** Today's yyyy-MM-dd in the app time zone. */
export function todayKey(now: Date = new Date()): string {
  return dateKeyOf(now);
}

/** First of the month containing a date key (yyyy-MM-dd or yyyy-MM). */
export function monthKeyOf(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/**
 * `yyyy-MM` of a date or month key: the value of an `<input type="month">`,
 * the `?month=` URL param and a per-month grouping key. The way back is
 * `monthKeyOf`.
 */
export function yearMonthOf(key: string): string {
  return key.slice(0, 7);
}

/** Whole months from `from` up to, not including, `to` (month keys); 0 if `to` isn't later. */
export function monthsBetween(from: string, to: string): number {
  const months = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7));
  return Math.max(0, months(to) - months(from));
}

/** First of the current month in the app time zone. */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKeyOf(todayKey(now));
}

/** Is `value` a yyyy-MM month, as in `?month=` and `<input type="month">`? */
export function isYearMonth(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/**
 * First of last month in the app time zone: the month reports (Overview,
 * Billing) open on, being the latest one that has ended and fallen due.
 */
export function lastMonthKey(now: Date = new Date()): string {
  return addMonthsToKey(currentMonthKey(now), -1);
}

/** Month key of a `?month=yyyy-MM` param; missing or malformed means last month. */
export function monthKeyFromParam(month: string | null | undefined, now: Date = new Date()): string {
  return isYearMonth(month) ? monthKeyOf(month) : lastMonthKey(now);
}

/** Month key `months` months after (or before, if negative) the given one. */
export function addMonthsToKey(monthKey: string, months: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1 + months;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

/** The first and last day (yyyy-MM-dd) of the month a key or yyyy-MM falls in. */
export function monthDayRange(key: string): { from: string; to: string } {
  const from = monthKeyOf(key);
  const next = addMonthsToKey(from, 1);
  const last = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0)).getUTCDate();
  return { from, to: `${from.slice(0, 8)}${String(last).padStart(2, "0")}` };
}

/** Is `value` a real yyyy-MM-dd calendar date? */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * "March 2026" / "Mar 2026" for a month key. Formatted as a UTC calendar
 * date with a fixed locale, so server and browser render the same text
 * whatever their own time zone.
 */
export function formatMonth(monthKey: string, style: "long" | "short" = "long"): string {
  return new Date(`${monthKey.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(APP_LOCALE, {
    timeZone: "UTC",
    month: style,
    year: "numeric",
  });
}

/** An instant as a readable date and time in the app time zone, e.g. for receipts. */
export function formatDateTime(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return d.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "24 Oct 2026" for a date key (yyyy-MM-dd); fixed locale and UTC, like formatMonth. */
export function formatDateKey(dateKey: string): string {
  return new Date(`${dateKey.slice(0, 10)}T00:00:00Z`).toLocaleDateString(APP_LOCALE, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

import { formatDateKey } from "@/lib/dates";
import { DISPLAY_DATE_FORMATS, type DisplayDateFormat } from "@/lib/types";

/**
 * The date formats the Settings page offers (A36, DISPLAY_DATE_FORMATS):
 * each shown as a fixed sample date written that way (day 18, so the day
 * and the month can't be mistaken for each other), with a plain-words
 * description for screen readers. Client-safe.
 */
export const DATE_FORMAT_SAMPLE = "2026-11-18";

const DESCRIPTIONS: Record<DisplayDateFormat, string> = {
  "DD/MMM/YYYY": "day, month name, year, with slashes",
  "DD/MM/YYYY": "day, month number, year, with slashes",
  "DD MMM YYYY": "day, month name, year, with spaces",
  "YYYY-MM-DD": "year, month number, day, with dashes",
};

export const DATE_FORMAT_OPTIONS: { value: DisplayDateFormat; example: string; description: string }[] =
  DISPLAY_DATE_FORMATS.map((value) => ({
    value,
    example: formatDateKey(DATE_FORMAT_SAMPLE, value),
    description: DESCRIPTIONS[value],
  }));

/** The sample date in `format`, e.g. "18/Nov/2026" - what the saved message shows. */
export const dateFormatExample = (format: DisplayDateFormat): string => formatDateKey(DATE_FORMAT_SAMPLE, format);

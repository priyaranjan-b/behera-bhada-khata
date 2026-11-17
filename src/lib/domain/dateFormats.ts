import { formatDateKey } from "@/lib/dates";
import { DISPLAY_DATE_FORMATS, type DisplayDateFormat } from "@/lib/types";

/**
 * The date formats the Settings page offers (A36, DISPLAY_DATE_FORMATS):
 * what each is called, and today's date written that way as the example.
 * Client-safe.
 */
const LABELS: Record<DisplayDateFormat, string> = {
  "DD/MMM/YYYY": "day/month name/year",
  "DD/MM/YYYY": "day/month/year",
  "DD MMM YYYY": "day month name year",
  "YYYY-MM-DD": "year-month-day (ISO)",
};

export const DATE_FORMAT_OPTIONS: { value: DisplayDateFormat; label: string; example: (dateKey: string) => string }[] =
  DISPLAY_DATE_FORMATS.map((value) => ({
    value,
    label: LABELS[value],
    example: (dateKey: string) => formatDateKey(dateKey, value),
  }));

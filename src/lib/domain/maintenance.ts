import { currentMonthKey, isDateKey, monthDayRange } from "@/lib/dates";
import { MAINTENANCE_CATEGORIES, type MaintenanceCategory } from "@/lib/types";
import { resolveDayRange, type DayRange } from "./payments";

// Maintenance expenses (0031, D35): what the owner spends on the houses.
// Client-safe: the form's split preview, the list and the history share it.

/** How each category reads; audit_value() in 0031 gives the same text (test/schema.test.ts). */
export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  painting: "Painting",
  carpentry: "Carpentry",
  civil_repair: "Civil & masonry",
  appliance: "Appliances",
  cleaning: "Cleaning",
  utilities: "Water & electricity bills",
  society_charges: "Society / common charges",
  property_tax: "Property tax",
  other: "Other",
};

/** For a `<select>`: every category in display order. */
export const MAINTENANCE_CATEGORY_OPTIONS = MAINTENANCE_CATEGORIES.map((value) => ({
  value,
  label: MAINTENANCE_CATEGORY_LABELS[value],
}));

export function isMaintenanceCategory(value: string): value is MaintenanceCategory {
  return (MAINTENANCE_CATEGORIES as readonly string[]).includes(value);
}

/** Never shows the raw value; an unknown category reads "Other". */
export function maintenanceCategoryLabel(category: string): string {
  return isMaintenanceCategory(category) ? MAINTENANCE_CATEGORY_LABELS[category] : MAINTENANCE_CATEGORY_LABELS.other;
}

/**
 * Whether cash went out for an expense (A22): not when a set-off against rent
 * paid for it - the set-off is already left out of cash received, so a cash
 * figure (Net cash) must leave the expense out too, or it is counted twice.
 * Net per rent month still subtracts every expense.
 */
export function isCashExpense(expense: { settledBy: unknown }): boolean {
  return expense.settledBy == null;
}

// ---- The Maintenance page: expenses by the day spent ----------------------------

/** The Maintenance grid's sortable and filterable columns (queries/maintenancePage.ts). */
export const MAINTENANCE_SORT_FIELDS = ["expenseDate", "description", "category", "amount", "unitsText"] as const;
export const MAINTENANCE_FILTER_FIELDS = [
  "expenseDate",
  "description",
  "category",
  "unitsText",
  "vendor",
  "note",
  "tags",
  "status",
] as const;

/**
 * The days a request or page URL asks for: as resolveDayRange (malformed
 * dates ignored), but no input = this month, where a new expense lands.
 */
export function maintenanceRange(params: { from?: string; to?: string }, maxDays: number, now: Date = new Date()): DayRange {
  const valid = (key: string | undefined) => (key && isDateKey(key) ? key : undefined);
  const from = valid(params.from);
  const to = valid(params.to);
  if (!from && !to) return monthDayRange(currentMonthKey(now));
  return resolveDayRange({ from, to }, maxDays, now);
}

/** Status column values, as shown (the grid filters on the label). */
export const MAINTENANCE_STATUS_LABELS = { counted: "Counted", voided: "Voided" } as const;

import type { StatCardRowColumns } from "@/components/ui/StatCardRow";

/**
 * The Overview's five stat cards (Vacant, its own section, is the fifth): a
 * swipe row on phones, three a row, all five from `xl`. Not from `lg`: at
 * 1200px a lakh-sized figure ("₹2,31,260.00") doesn't fit a fifth of the row (A26).
 * Its own module: MonthStats is a client component (A31), and a server
 * component can't read a value from one.
 */
export const STAT_COLUMNS = { sm: 3, xl: 5 } as const satisfies StatCardRowColumns;

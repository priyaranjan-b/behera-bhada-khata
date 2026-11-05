import type { StatCardRowColumns } from "@/components/ui/StatCardRow";

/** The Defaulters cards, one per age band: a swipe row on phones, two a row, four from `lg` (A26). */
export const DEFAULTER_STAT_COLUMNS = { sm: 2, lg: 4 } as const satisfies StatCardRowColumns;

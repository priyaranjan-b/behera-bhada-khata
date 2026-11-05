import type { StatCardRowColumns } from "@/components/ui/StatCardRow";

/** The Earnings stat cards: a swipe row on phones, two a row, three on tablets, six on wide screens (A26). */
export const EARNINGS_STAT_COLUMNS = { sm: 2, md: 3, lg: 6 } as const satisfies StatCardRowColumns;

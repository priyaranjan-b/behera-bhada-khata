import type { StatCardRowColumns } from "@/components/ui/StatCardRow";

/** The Maintenance stat cards: a swipe row on phones, two a row, four on wide screens (A26). */
export const MAINTENANCE_STAT_COLUMNS = { sm: 2, md: 4 } as const satisfies StatCardRowColumns;

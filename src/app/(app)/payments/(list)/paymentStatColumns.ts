import type { StatCardRowColumns } from "@/components/ui/StatCardRow";

/** The Payments stat cards: one swipe row on phones, two a row on small tablets, four on tablets, all seven on wide screens. */
export const PAYMENT_STAT_COLUMNS = { sm: 2, md: 4, lg: 7 } as const satisfies StatCardRowColumns;

import type { PaymentsPage } from "@/lib/contracts";
import type { DayRange } from "@/lib/domain/payments";
import PaymentsView from "../PaymentsView";

/** Payments: the per-mode cards and the table, one page at a time (A15); the cards follow its search and filters. */
export default async function PaymentsSection({
  grid,
  range,
  rangeLabel,
  paidDirectCard,
  tagSuggestions,
}: {
  grid: Promise<PaymentsPage>;
  /** Suggested tag names for the tag editor. */
  tagSuggestions: Promise<string[]>;
  range: DayRange;
  rangeLabel: string;
  /** Streams on its own call (Govt paid direct). */
  paidDirectCard: React.ReactNode;
}) {
  const [initial, suggestions] = await Promise.all([grid, tagSuggestions]);
  return (
    <PaymentsView
      initial={initial}
      range={range}
      rangeLabel={rangeLabel}
      paidDirectCard={paidDirectCard}
      tagSuggestions={suggestions}
    />
  );
}

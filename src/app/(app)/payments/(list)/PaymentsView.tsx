"use client";

import Stack from "@mui/material/Stack";
import AsyncSection from "@/components/ui/AsyncSection";
import StatCardRow from "@/components/ui/StatCardRow";
import type { PaymentTotals } from "@/lib/contracts";
import type { DayRange } from "@/lib/domain/payments";
import PaymentStatCards from "./PaymentStatCards";
import PaymentsTable, { usePaymentsGrid } from "./PaymentsTable";
import { PAYMENTS_SKELETONS as SKELETON } from "./paymentsSkeletons";
import { PAYMENT_STAT_COLUMNS } from "./paymentStatColumns";

/**
 * The Payments page below its header: the stat cards and the table, each
 * loading on its own (A12, A18).
 * - The cards are the days' totals (`/payments/totals`): the page starts the
 *   call and passes the promise, read here with `use()`. The table's search,
 *   filters and a tapped card never change them; a card only filters the
 *   table (A28). Govt paid direct streams on its own call beside them.
 * - The table loads each page in the browser over `GET /api/dashboard/payments`.
 * Key it by the days: a new range starts again from page 1.
 */
export default function PaymentsView({
  totals,
  range,
  rangeLabel,
  paidDirectCard,
  tagSuggestions,
}: {
  /** The stat cards' figures for the days, whatever the table shows. */
  totals: Promise<PaymentTotals>;
  range: DayRange;
  rangeLabel: string;
  /** Streams on its own call (Govt paid direct), outside the totals' boundary. */
  paidDirectCard: React.ReactNode;
  /** Suggested tag names for the tag editor (Settings). */
  tagSuggestions: Promise<string[]>;
}) {
  const grid = usePaymentsGrid(range);
  return (
    <Stack spacing={2}>
      <StatCardRow columns={PAYMENT_STAT_COLUMNS} label="Payment totals">
        <AsyncSection title="Payment totals" fallback={SKELETON.cards} wide>
          <PaymentStatCards totals={totals} filter={grid.filter} setFilter={grid.setFilter} rangeLabel={rangeLabel} />
        </AsyncSection>
        {paidDirectCard}
      </StatCardRow>
      <AsyncSection title="Payments" fallback={SKELETON.table}>
        <PaymentsTable grid={grid} rangeLabel={rangeLabel} tagSuggestions={tagSuggestions} />
      </AsyncSection>
    </Stack>
  );
}

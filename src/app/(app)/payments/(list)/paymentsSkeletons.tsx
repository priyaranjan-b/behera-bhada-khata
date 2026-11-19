import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import StatCardRow from "@/components/ui/StatCardRow";
import { PAYMENT_STAT_COLUMNS } from "./paymentStatColumns";

// The six cards from the totals call (received, four modes, set-off); Govt paid direct is the seventh.
const CARDS = (
  <>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <StatCardSkeleton key={i} />
    ))}
  </>
);

/**
 * The placeholder for each Payments section, sized like its cards: page.tsx
 * uses them as fallbacks, loading.tsx shows them all (A12).
 */
export const PAYMENTS_SKELETONS = {
  header: (
    <>
      <PageHeaderSkeleton />
      <ContextBarSkeleton />
    </>
  ),
  stat: <StatCardSkeleton />,
  cards: CARDS,
  table: <PanelSkeleton />,
  view: (
    <Stack spacing={2}>
      <StatCardRow columns={PAYMENT_STAT_COLUMNS} label="Payment totals">
        {CARDS}
        <StatCardSkeleton />
      </StatCardRow>
      <PanelSkeleton />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import StatCardRow from "@/components/ui/StatCardRow";
import { PAYMENT_STAT_COLUMNS } from "./paymentStatCell";

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
  // Seven stat cards (received, four modes, set-off, Govt paid direct), then the table.
  view: (
    <Stack spacing={2}>
      <StatCardRow columns={PAYMENT_STAT_COLUMNS} label="Payment totals">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </StatCardRow>
      <PanelSkeleton />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

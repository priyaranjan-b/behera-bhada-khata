import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, ChartCardSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { EARNINGS_STAT_COLUMNS } from "./earningsStatColumns";
import StatCardRow from "@/components/ui/StatCardRow";

/** The Earnings page's placeholders, sized like its cards: page.tsx's fallback and loading.tsx (A12). */
export const EARNINGS_SKELETONS = {
  header: (
    <>
      <PageHeaderSkeleton />
      <ContextBarSkeleton />
    </>
  ),
  // Six stat cards, the chart, then the table.
  view: (
    <Stack spacing={2}>
      <StatCardRow columns={EARNINGS_STAT_COLUMNS} label="Earnings totals">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </StatCardRow>
      <ChartCardSkeleton height={280} />
      <PanelSkeleton rows={6} />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

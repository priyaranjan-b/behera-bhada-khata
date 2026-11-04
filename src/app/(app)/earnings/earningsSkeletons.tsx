import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, ChartCardSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { EARNINGS_STAT_CELL } from "./earningsStatCell";

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
      <Grid container spacing={2} columns={12}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Grid key={i} size={EARNINGS_STAT_CELL}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <ChartCardSkeleton height={280} />
      <PanelSkeleton rows={6} />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

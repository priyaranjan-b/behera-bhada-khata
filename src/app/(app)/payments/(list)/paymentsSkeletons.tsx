import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { PAYMENT_STAT_CELL } from "./paymentStatCell";

/**
 * The placeholder for each Payments section, sized like its cards: page.tsx
 * uses them as fallbacks, loading.tsx shows them all (A12).
 */
export const PAYMENTS_SKELETONS = {
  header: <PageHeaderSkeleton action />,
  stat: <StatCardSkeleton />,
  // Seven stat cards (received, four modes, set-off, Govt paid direct), then the table.
  view: (
    <Stack spacing={2}>
      <Grid container spacing={2} columns={12}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Grid key={i} size={PAYMENT_STAT_CELL}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <PanelSkeleton />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

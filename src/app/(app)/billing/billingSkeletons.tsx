import Grid from "@mui/material/Grid";
import { PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { BILLING_STAT_CELL } from "./sections/BillingStats";

/**
 * The placeholder for each Billing section, sized like its card: page.tsx
 * uses them as fallbacks, loading.tsx shows them all (A12).
 */
export const BILLING_SKELETONS = {
  header: <PageHeaderSkeleton action />,
  // Billed, Collected, Balance: three stat-card grid cells.
  stats: [0, 1, 2].map((i) => (
    <Grid key={i} size={BILLING_STAT_CELL}>
      <StatCardSkeleton />
    </Grid>
  )),
  received: <StatCardSkeleton />,
  grid: <PanelSkeleton />,
} satisfies Record<string, React.ReactNode>;

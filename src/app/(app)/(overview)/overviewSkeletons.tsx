import Grid from "@mui/material/Grid";
import {
  ChartCardSkeleton,
  DetailCardSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
  StatCardSkeleton,
} from "@/components/ui/Skeletons";
import { STAT_CELL } from "./sections/MonthStats";

/**
 * The placeholder for each OverviewLayout slot, sized like the card it
 * stands in for. page.tsx uses one as each section's fallback, loading.tsx
 * fills the whole layout with them (A12) - one list, so they can't drift.
 */
export const OVERVIEW_SKELETONS = {
  header: <PageHeaderSkeleton action />,
  // Four stat-card grid cells; the Vacant slot is already a cell.
  stats: Array.from({ length: 4 }, (_, i) => (
    <Grid key={i} size={STAT_CELL}>
      <StatCardSkeleton />
    </Grid>
  )),
  vacant: <StatCardSkeleton />,
  trend: <ChartCardSkeleton />,
  attention: <DetailCardSkeleton rows={4} />,
  defaulters: <DetailCardSkeleton rows={5} />,
  sites: <DetailCardSkeleton rows={3} />,
  tenantTypes: <ChartCardSkeleton height={220} />,
  portfolio: <DetailCardSkeleton rows={5} />,
  tenants: <PanelSkeleton rows={5} />,
} satisfies Record<string, React.ReactNode>;

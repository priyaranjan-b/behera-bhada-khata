import Grid from "@mui/material/Grid";
import {
  ChartCardSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  PanelSkeleton,
  StatCardSkeleton,
} from "@/components/ui/Skeletons";

// The (overview) group scopes this to /dashboard itself; other dashboard
// pages fall back to the generic skeleton in ../loading.tsx.
export default function OverviewLoading() {
  return (
    <PageSkeleton label="Loading overview…">
      <PageHeaderSkeleton action />
      <Grid container spacing={2} columns={12}>
        {Array.from({ length: 4 }, (_, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <ChartCardSkeleton />
      <PanelSkeleton />
    </PageSkeleton>
  );
}

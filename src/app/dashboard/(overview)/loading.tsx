import Grid from "@mui/material/Grid";
import {
  ChartCardSkeleton,
  DetailCardSkeleton,
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
        {Array.from({ length: 5 }, (_, i) => (
          <Grid key={i} size={{ xs: 6, lg: "grow" }}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCardSkeleton />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <DetailCardSkeleton rows={4} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DetailCardSkeleton rows={5} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DetailCardSkeleton rows={3} />
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ChartCardSkeleton height={220} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <DetailCardSkeleton rows={5} />
        </Grid>
      </Grid>
      <PanelSkeleton rows={5} />
    </PageSkeleton>
  );
}

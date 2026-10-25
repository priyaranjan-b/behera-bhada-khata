import Grid from "@mui/material/Grid";
import { PageHeaderSkeleton, PageSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";

export default function BillingLoading() {
  return (
    <PageSkeleton label="Loading billing…">
      <PageHeaderSkeleton action />
      <Grid container spacing={2} columns={12}>
        {Array.from({ length: 4 }, (_, i) => (
          <Grid key={i} size={{ xs: 6, lg: 3 }}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <PanelSkeleton />
    </PageSkeleton>
  );
}

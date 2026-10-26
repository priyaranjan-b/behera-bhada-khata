import Grid from "@mui/material/Grid";
import { DetailCardSkeleton, PageHeaderSkeleton, PageSkeleton, TabsSkeleton } from "@/components/ui/Skeletons";
import { AccountStatsSkeleton } from "./sections/AccountStats";

// Same shape as page.tsx: header, account stats, the tab bar and the Details
// tab (the one most visits open on). The (profile) group scopes this to the
// tenant page itself, so Edit or Record payment never shows it.
export default function TenantLoading() {
  return (
    <PageSkeleton label="Loading tenant…">
      <PageHeaderSkeleton action />
      <Grid container spacing={2} columns={12}>
        <AccountStatsSkeleton />
      </Grid>
      <div>
        <TabsSkeleton />
        <Grid container spacing={2} columns={12}>
          <Grid size={{ xs: 12, md: 6 }}>
            <DetailCardSkeleton rows={8} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DetailCardSkeleton rows={2} />
          </Grid>
        </Grid>
      </div>
    </PageSkeleton>
  );
}

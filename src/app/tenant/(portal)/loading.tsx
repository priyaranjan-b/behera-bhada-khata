import Grid from "@mui/material/Grid";
import { DetailCardSkeleton, PageHeaderSkeleton, PageSkeleton, TabsSkeleton } from "@/components/ui/Skeletons";
import { AccountStatsSkeleton } from "@/components/domain/AccountStats";

// Same shape as page.tsx: header, account stats, the tab bar and the Details tab.
export default function TenantPortalLoading() {
  return (
    <PageSkeleton label="Loading your account…">
      <PageHeaderSkeleton />
      <Grid container spacing={2} columns={12}>
        <AccountStatsSkeleton />
      </Grid>
      <div>
        <TabsSkeleton />
        <Grid container spacing={2} columns={12}>
          <Grid size={{ xs: 12, md: 6 }}>
            <DetailCardSkeleton rows={7} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DetailCardSkeleton rows={2} />
          </Grid>
        </Grid>
      </div>
    </PageSkeleton>
  );
}

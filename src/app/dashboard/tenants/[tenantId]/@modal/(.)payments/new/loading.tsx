import Grid from "@mui/material/Grid";
import { RouteModal } from "@/components/ui/RouteModal";
import { DetailCardSkeleton, PageSkeleton } from "@/components/ui/Skeletons";

export default function NewPaymentModalLoading() {
  return (
    <RouteModal title="Record payment">
      <PageSkeleton label="Loading payment form…">
        <Grid container spacing={2} columns={12}>
          <Grid size={{ xs: 12, md: 7 }}>
            <DetailCardSkeleton rows={4} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <DetailCardSkeleton rows={3} />
          </Grid>
        </Grid>
      </PageSkeleton>
    </RouteModal>
  );
}

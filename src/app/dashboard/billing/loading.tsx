import Grid from "@mui/material/Grid";
import { PageSkeleton } from "@/components/ui/Skeletons";
import { BILLING_SKELETONS } from "./billingSkeletons";
import { BILLING_STAT_CELL } from "./sections/BillingStats";

// Same placeholders as each section's fallback in page.tsx.
export default function BillingLoading() {
  return (
    <PageSkeleton label="Loading billing…">
      {BILLING_SKELETONS.header}
      <Grid container spacing={2} columns={12}>
        {BILLING_SKELETONS.stats}
        <Grid size={BILLING_STAT_CELL}>{BILLING_SKELETONS.received}</Grid>
      </Grid>
      {BILLING_SKELETONS.grid}
    </PageSkeleton>
  );
}

import { PageSkeleton } from "@/components/ui/Skeletons";
import { BILLING_SKELETONS } from "./billingSkeletons";
import { BILLING_STAT_COLUMNS } from "./sections/BillingStats";
import StatCardRow from "@/components/ui/StatCardRow";

// Same placeholders as each section's fallback in page.tsx.
export default function BillingLoading() {
  return (
    <PageSkeleton label="Loading billing…">
      {BILLING_SKELETONS.header}
      <StatCardRow columns={BILLING_STAT_COLUMNS} label="Billing totals">
        {BILLING_SKELETONS.stats}
        {BILLING_SKELETONS.received}
      </StatCardRow>
      {BILLING_SKELETONS.grid}
    </PageSkeleton>
  );
}

import { PageSkeleton } from "@/components/ui/Skeletons";
import { PAYMENTS_SKELETONS } from "./paymentsSkeletons";

// Same placeholders as each section's fallback in page.tsx.
export default function PaymentsLoading() {
  return (
    <PageSkeleton label="Loading payments…">
      {PAYMENTS_SKELETONS.header}
      {PAYMENTS_SKELETONS.view}
    </PageSkeleton>
  );
}

import { PageSkeleton } from "@/components/ui/Skeletons";
import { EARNINGS_SKELETONS } from "./earningsSkeletons";

// Same placeholders as the section's fallback in page.tsx.
export default function EarningsLoading() {
  return (
    <PageSkeleton label="Loading earnings…">
      {EARNINGS_SKELETONS.header}
      {EARNINGS_SKELETONS.view}
    </PageSkeleton>
  );
}

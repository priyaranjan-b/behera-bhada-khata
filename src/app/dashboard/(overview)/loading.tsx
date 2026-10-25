import { PageSkeleton } from "@/components/ui/Skeletons";
import OverviewLayout from "./OverviewLayout";
import { OVERVIEW_SKELETONS } from "./overviewSkeletons";

// The (overview) group scopes this to /dashboard itself; other dashboard
// pages fall back to the generic skeleton in ../loading.tsx. Same layout and
// placeholders as each section's own fallback in page.tsx.
export default function OverviewLoading() {
  return (
    <PageSkeleton label="Loading overview…">
      <OverviewLayout {...OVERVIEW_SKELETONS} />
    </PageSkeleton>
  );
}

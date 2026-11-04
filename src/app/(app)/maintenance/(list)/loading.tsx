import { PageSkeleton } from "@/components/ui/Skeletons";
import { MAINTENANCE_SKELETONS } from "./maintenanceSkeletons";

// Same placeholders as the section's fallback in page.tsx.
export default function MaintenanceLoading() {
  return (
    <PageSkeleton label="Loading maintenance…">
      {MAINTENANCE_SKELETONS.header}
      {MAINTENANCE_SKELETONS.view}
    </PageSkeleton>
  );
}

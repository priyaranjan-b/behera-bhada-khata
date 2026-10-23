import { PageHeaderSkeleton, PageSkeleton, PanelSkeleton } from "@/components/ui/Skeletons";

export default function DashboardLoading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <PanelSkeleton />
    </PageSkeleton>
  );
}

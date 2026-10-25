import { PageHeaderSkeleton, PageSkeleton, PanelSkeleton } from "@/components/ui/Skeletons";

export default function ActivityLoading() {
  return (
    <PageSkeleton label="Loading activity…">
      <PageHeaderSkeleton />
      <PanelSkeleton rows={8} />
    </PageSkeleton>
  );
}

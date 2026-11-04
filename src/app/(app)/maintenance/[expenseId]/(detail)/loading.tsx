import { DetailCardSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/ui/Skeletons";

export default function MaintenanceExpenseLoading() {
  return (
    <PageSkeleton label="Loading expense…">
      <PageHeaderSkeleton action />
      <DetailCardSkeleton rows={6} />
    </PageSkeleton>
  );
}

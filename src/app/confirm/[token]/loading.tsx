import { BrandMark } from "@/components/shell/BrandMark";
import { PublicLayout } from "@/components/ui";
import { DetailCardSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/components/ui/Skeletons";

export default function ConfirmLoading() {
  return (
    <PublicLayout width="md" align="top">
      <PageSkeleton label="Loading details…">
        <BrandMark />
        <PageHeaderSkeleton />
        <DetailCardSkeleton rows={6} />
        <DetailCardSkeleton rows={3} />
      </PageSkeleton>
    </PublicLayout>
  );
}

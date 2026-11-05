import { PageHeaderSkeleton, PageSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import StatCardRow from "@/components/ui/StatCardRow";
import { DEFAULTER_STAT_COLUMNS } from "./defaulterStatColumns";

export default function DefaultersLoading() {
  return (
    <PageSkeleton label="Loading defaulters…">
      <PageHeaderSkeleton />
      <StatCardRow columns={DEFAULTER_STAT_COLUMNS} label="Arrears by age">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </StatCardRow>
      <PanelSkeleton />
    </PageSkeleton>
  );
}

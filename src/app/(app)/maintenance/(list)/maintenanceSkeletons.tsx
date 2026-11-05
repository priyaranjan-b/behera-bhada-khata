import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { MAINTENANCE_STAT_COLUMNS } from "./maintenanceStatCell";
import StatCardRow from "@/components/ui/StatCardRow";

/** The Maintenance page's placeholders, sized like its cards: page.tsx's fallback and loading.tsx (A12). */
export const MAINTENANCE_SKELETONS = {
  header: (
    <>
      <PageHeaderSkeleton action />
      <ContextBarSkeleton />
    </>
  ),
  // Four stat cards, then the table.
  view: (
    <Stack spacing={2}>
      <StatCardRow columns={MAINTENANCE_STAT_COLUMNS} label="Maintenance totals">
        {[0, 1, 2, 3].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </StatCardRow>
      <PanelSkeleton />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

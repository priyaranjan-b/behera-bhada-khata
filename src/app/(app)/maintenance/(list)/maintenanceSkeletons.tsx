import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { ContextBarSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { MAINTENANCE_STAT_CELL } from "./maintenanceStatCell";

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
      <Grid container spacing={2} columns={12}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={MAINTENANCE_STAT_CELL}>
            <StatCardSkeleton />
          </Grid>
        ))}
      </Grid>
      <PanelSkeleton />
    </Stack>
  ),
} satisfies Record<string, React.ReactNode>;

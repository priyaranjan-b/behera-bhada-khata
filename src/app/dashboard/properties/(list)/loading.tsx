import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { PageHeaderSkeleton, PageSkeleton, SectionHeadingSkeleton, TileCardSkeleton } from "@/components/ui/Skeletons";
import { TOWER_CELL } from "./towerCell";

// Same shape as page.tsx: header, then each site's heading over its tower
// cards. The (list) group scopes this to /dashboard/properties itself, so a
// tower page or the Add tower form never shows it.
const SITES = [3, 2];

export default function PropertiesLoading() {
  return (
    <PageSkeleton label="Loading properties…">
      <Stack spacing={3}>
        <PageHeaderSkeleton action />
        {SITES.map((towers, site) => (
          <Stack key={site} spacing={1.5}>
            <SectionHeadingSkeleton />
            <Grid container spacing={2} columns={12}>
              {Array.from({ length: towers }, (_, i) => (
                <Grid key={i} size={TOWER_CELL}>
                  <TileCardSkeleton />
                </Grid>
              ))}
            </Grid>
          </Stack>
        ))}
      </Stack>
    </PageSkeleton>
  );
}

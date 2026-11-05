import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { STAT_COLUMNS } from "./sections/MonthStats";
import StatCardRow from "@/components/ui/StatCardRow";

/**
 * Where each Overview section goes. The page fills the slots with streamed
 * sections and loading.tsx with their skeletons, so the two can't drift (A12).
 * `stats` is three stat cards in the stat row (Vacant is the fourth); every other slot is one card.
 */
export default function OverviewLayout(slots: {
  header: React.ReactNode;
  stats: React.ReactNode;
  vacant: React.ReactNode;
  trend: React.ReactNode;
  attention: React.ReactNode;
  defaulters: React.ReactNode;
  sites: React.ReactNode;
  tenantTypes: React.ReactNode;
  portfolio: React.ReactNode;
}) {
  return (
    <Stack spacing={2}>
      {slots.header}
      <StatCardRow columns={STAT_COLUMNS} label="This month's figures">
        {slots.stats}
        {slots.vacant}
      </StatCardRow>
      {/* Phones: what the owner acts on first (attention, defaulters), then the chart, then the reference cards. */}
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0, order: { xs: 3, sm: 0 } }}>
          {slots.trend}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }} sx={{ minWidth: 0, order: { xs: 1, sm: 0 } }}>
          {slots.attention}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0, order: { xs: 2, sm: 0 } }}>
          {slots.defaulters}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0, order: { xs: 4, sm: 0 } }}>
          {slots.sites}
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0, order: { xs: 5, sm: 0 } }}>
          {slots.tenantTypes}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }} sx={{ minWidth: 0, order: { xs: 6, sm: 0 } }}>
          {slots.portfolio}
        </Grid>
      </Grid>
    </Stack>
  );
}

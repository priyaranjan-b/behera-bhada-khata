import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { STAT_CELL } from "./sections/MonthStats";

/**
 * Where each Overview section goes. The page fills the slots with streamed
 * sections and loading.tsx with their skeletons, so the two can't drift (A12).
 * `stats` is four stat-card grid cells; every other slot is one card.
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
  tenants: React.ReactNode;
}) {
  return (
    <Stack spacing={2}>
      {slots.header}
      <Grid container spacing={2} columns={12}>
        {slots.stats}
        <Grid size={STAT_CELL}>{slots.vacant}</Grid>
      </Grid>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0 }}>
          {slots.trend}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }} sx={{ minWidth: 0 }}>
          {slots.attention}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          {slots.defaulters}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          {slots.sites}
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0 }}>
          {slots.tenantTypes}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }} sx={{ minWidth: 0 }}>
          {slots.portfolio}
        </Grid>
      </Grid>
      {slots.tenants}
    </Stack>
  );
}

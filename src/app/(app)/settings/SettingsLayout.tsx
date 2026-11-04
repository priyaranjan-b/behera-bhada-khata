import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

/** Where each Settings section goes; page.tsx and loading.tsx share it so they can't drift. */
export default function SettingsLayout(slots: { header: React.ReactNode; tags: React.ReactNode; notes: React.ReactNode }) {
  return (
    <Stack spacing={2}>
      {slots.header}
      <Grid container spacing={2} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          {slots.tags}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
          {slots.notes}
        </Grid>
      </Grid>
    </Stack>
  );
}

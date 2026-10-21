import Link from "@/components/Link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ApartmentIcon from "@mui/icons-material/Apartment";
import { createClient } from "@/lib/supabase/server";
import theme from "@/theme";

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address")
    .order("created_at", { ascending: true });

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, property_id, unit_type")
    .eq("status", "active");

  const countsByProperty = new Map<string, { residential: number; commercial: number }>();
  for (const t of tenants ?? []) {
    const counts = countsByProperty.get(t.property_id) ?? { residential: 0, commercial: 0 };
    counts[t.unit_type] += 1;
    countsByProperty.set(t.property_id, counts);
  }

  return (
    <Stack spacing={4}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Properties
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Every property you manage - each can hold both residential and commercial units.
          </Typography>
        </Box>
        <Button component={Link} href="/dashboard/properties/new" variant="contained" startIcon={<AddIcon />}>
          Add property
        </Button>
      </Stack>

      {!properties || properties.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: "center" }}>
          <ApartmentIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            No properties yet
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Add your first property to start tracking rent.
          </Typography>
          <Button component={Link} href="/dashboard/properties/new" variant="contained" startIcon={<AddIcon />}>
            Add property
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {properties.map((property) => {
            const counts = countsByProperty.get(property.id) ?? { residential: 0, commercial: 0 };
            const total = counts.residential + counts.commercial;
            const color = theme.palette.primary.main;
            return (
              <Grid key={property.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper
                  component={Link}
                  href={`/dashboard/properties/${property.id}`}
                  sx={{
                    p: 2.5,
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    height: "100%",
                    transition: "box-shadow 0.15s, transform 0.15s",
                    "&:hover": { boxShadow: 4, transform: "translateY(-2px)" },
                  }}
                >
                  <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                    <Avatar sx={{ bgcolor: alpha(color, 0.12), color, width: 44, height: 44 }}>
                      <ApartmentIcon />
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                        {property.name}
                      </Typography>
                      {property.address ? (
                        <Typography variant="body2" color="textSecondary" noWrap>
                          {property.address}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                        {total === 0 ? (
                          <Chip size="small" label="No tenants yet" variant="outlined" />
                        ) : (
                          <>
                            {counts.residential > 0 ? (
                              <Chip size="small" label={`${counts.residential} residential`} variant="outlined" />
                            ) : null}
                            {counts.commercial > 0 ? (
                              <Chip size="small" label={`${counts.commercial} commercial`} variant="outlined" />
                            ) : null}
                          </>
                        )}
                      </Stack>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}

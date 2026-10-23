import Link from "@/components/Link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { serverApi } from "@/lib/api-client/server";
import { EmptyState, PageHeader, StatusBadge, TagPill } from "@/components/DataComponents";
import { BadgeRow, IconTile } from "@/components/ui";

export default async function PropertiesPage() {
  const properties = await serverApi.dashboard.properties.list();

  const addButton = (
    <Button component={Link} href="/dashboard/properties/new" variant="contained" startIcon={<AddRoundedIcon />}>
      Add property
    </Button>
  );

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Properties"
        subtitle="Every property you manage - each can hold both residential and commercial units."
        action={addButton}
      />

      {properties.length === 0 ? (
        <Card variant="outlined">
          <EmptyState
            icon={<ApartmentRoundedIcon />}
            title="No properties yet"
            description="Add your first property to start tracking rent."
            action={addButton}
          />
        </Card>
      ) : (
        <Grid container spacing={2} columns={12}>
          {properties.map((property) => {
            const total = property.residentialTenants + property.commercialTenants;
            return (
              <Grid key={property.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <Stack spacing={2} useFlexGap sx={{ height: "100%" }}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                      <IconTile icon={<ApartmentRoundedIcon fontSize="small" />} size="sm" />
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography component="h2" variant="subtitle2" noWrap>
                          {property.name}
                        </Typography>
                        {property.address ? (
                          <Typography variant="caption" color="textSecondary" component="p" noWrap>
                            {property.address}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>

                    <BadgeRow>
                      {total === 0 ? (
                        <StatusBadge tone="neutral" label="No tenants yet" />
                      ) : (
                        <>
                          <StatusBadge tone="success" label={`${total} active tenant${total === 1 ? "" : "s"}`} />
                          {property.residentialTenants > 0 ? <TagPill label={`${property.residentialTenants} residential`} /> : null}
                          {property.commercialTenants > 0 ? <TagPill label={`${property.commercialTenants} commercial`} /> : null}
                        </>
                      )}
                    </BadgeRow>

                    <Box sx={{ mt: "auto" }}>
                      <Button
                        component={Link}
                        href={`/dashboard/properties/${property.id}`}
                        variant="outlined"
                        size="small"
                        endIcon={<ArrowForwardRoundedIcon />}
                        aria-label={`View ${property.name}`}
                      >
                        View
                      </Button>
                    </Box>
                  </Stack>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}

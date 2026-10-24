import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";
import { EmptyState, PageHeader, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { AppCard, BadgeRow, IconTile } from "@/components/ui";
import LinkButton from "@/components/ui/Loading/LinkButton";

export default async function PropertiesPage() {
  const groups = await serverApi.dashboard.properties.list();
  const towerCount = groups.reduce((n, g) => n + g.properties.length, 0);

  const addButton = (
    <LinkButton href={routes.properties.new} variant="contained" startIcon={<AddRoundedIcon />}>
      Add tower
    </LinkButton>
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Properties"
        subtitle="Your sites, the towers in each, and how many houses are let."
        action={groups.length > 0 ? addButton : undefined}
      />

      {towerCount === 0 ? (
        <AppCard>
          <EmptyState
            icon={<ApartmentRoundedIcon />}
            title="No towers yet"
            description="Load the master data (supabase/seed) or add a tower to a site to start tracking rent."
            action={groups.length > 0 ? addButton : undefined}
          />
        </AppCard>
      ) : null}

      {groups.map(({ location, properties }) => (
        <Stack key={location.code} spacing={1.5} component="section" aria-labelledby={`site-${location.code}`}>
          <Box>
            <Typography id={`site-${location.code}`} component="h2" variant="h6">
              {location.name} · {location.code}
            </Typography>
            {location.address ? (
              <Typography variant="body2" color="textSecondary">
                {location.address}
              </Typography>
            ) : null}
          </Box>

          <Grid container spacing={2} columns={12}>
            {properties.map((property) => {
              const vacant = property.totalUnits - property.occupiedUnits;
              return (
                <Grid key={property.code} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <AppCard href={routes.properties.detail(property.code)} sx={{ height: "100%" }}>
                    <Stack spacing={2} useFlexGap sx={{ height: "100%" }}>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                        <IconTile icon={<ApartmentRoundedIcon fontSize="small" />} size="sm" />
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography component="h3" variant="subtitle2" noWrap>
                            {property.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" component="p" noWrap>
                            {property.code}
                          </Typography>
                        </Box>
                        <ChevronRightRoundedIcon aria-hidden color="action" />
                      </Stack>

                      <BadgeRow>
                        {property.totalUnits === 0 ? (
                          <StatusBadge tone="neutral" label="No houses yet" />
                        ) : (
                          <>
                            <StatusBadge
                              tone={vacant === 0 ? "success" : "info"}
                              label={`${property.occupiedUnits} of ${property.totalUnits} let`}
                            />
                            {property.residentialUnits > 0 ? <TagPill label={`${property.residentialUnits} residential`} /> : null}
                            {property.commercialUnits > 0 ? <TagPill label={`${property.commercialUnits} commercial`} /> : null}
                          </>
                        )}
                      </BadgeRow>
                    </Stack>
                  </AppCard>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      ))}
    </Stack>
  );
}

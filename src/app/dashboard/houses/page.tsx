import Stack from "@mui/material/Stack";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";
import { serverApi } from "@/lib/api-client/server";
import { EmptyState, PageHeader } from "@/components/ui/DataDisplay";
import { LinkButton } from "@/components/ui/Loading";
import UnitsGrid from "@/components/domain/UnitsGrid";
import { isVacant, parseHouseFilter } from "@/lib/domain/houses";
import { routes } from "@/lib/routes";

export default async function HousesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const filter = parseHouseFilter(show);
  const units = await serverApi.dashboard.houses.list();
  const vacant = units.filter((u) => isVacant({ isActive: u.isActive, occupied: Boolean(u.currentTenant) })).length;
  const towers = new Set(units.map((u) => u.propertyCode)).size;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Houses"
        subtitle={`${units.length} house${units.length === 1 ? "" : "s"} across ${towers} tower${towers === 1 ? "" : "s"}, ${vacant} vacant.`}
        action={
          <LinkButton href={routes.houses.new} variant="contained" startIcon={<AddHomeWorkRoundedIcon />}>
            Add house
          </LinkButton>
        }
      />
      {/* key: a new ?show= (e.g. from the dashboard card) resets the filter. */}
      <UnitsGrid
        key={filter}
        units={units}
        propertyName="all towers"
        showTower
        initialFilter={filter}
        emptyState={<EmptyState title="No houses yet" description="Add a house to a tower to see it here." />}
      />
    </Stack>
  );
}

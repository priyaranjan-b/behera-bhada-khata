import Stack from "@mui/material/Stack";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { serverApi } from "@/lib/api-client/server";
import { maintenanceRange } from "@/lib/domain/maintenance";
import { dayRangeLabel, dayRangeUnit, shiftDayRange } from "@/lib/domain/payments";
import { routes } from "@/lib/routes";
import { MAINTENANCE_LIMITS } from "@/lib/validation";
import AsyncSection from "@/components/ui/AsyncSection";
import DayRangeForm from "@/components/ui/DayRangeForm";
import { PageHeader } from "@/components/ui/DataDisplay";
import { ActionStack } from "@/components/ui";
import { LinkButton } from "@/components/ui/Loading";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { MAINTENANCE_SKELETONS as SKELETON } from "./maintenanceSkeletons";
import MaintenanceSection from "./sections/MaintenanceSection";

// Every maintenance expense (0031, D35) by the day it was spent, this month
// by default. The days come from the URL, so the header and the date form
// render at once; the table with its cards (one call, the cards follow the
// table's search and filters, as on Payments, A18) streams in.
export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const range = maintenanceRange(await searchParams, MAINTENANCE_LIMITS.maxDays);
  const grid = serverApi.dashboard.maintenance.list(range);
  const tagSuggestions = serverApi.dashboard.payments.tagSuggestions();
  const rangeLabel = dayRangeLabel(range);
  const view = `${range.from}-${range.to}`;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Maintenance"
        subtitle="What was spent on the houses, by the day it was paid."
        action={
          <ActionStack phone="primaryOnTop">
            <PeriodSwitcher
              label={rangeLabel}
              unit={dayRangeUnit(range)}
              prevHref={routes.maintenance.list(shiftDayRange(range, -1))}
              nextHref={routes.maintenance.list(shiftDayRange(range, 1))}
            />
            <LinkButton href={routes.maintenance.new} variant="contained" startIcon={<AddRoundedIcon />}>
              Record maintenance
            </LinkButton>
          </ActionStack>
        }
      />
      {/* Remount on a new range so the inputs show it. Sibling keys must differ, or React keeps the old form. */}
      <DayRangeForm key={`form-${view}`} from={range.from} to={range.to} path={routes.maintenance.list()} fromLabel="Spent from" />
      <AsyncSection key={`grid-${view}`} title="Maintenance" fallback={SKELETON.view}>
        <MaintenanceSection grid={grid} tagSuggestions={tagSuggestions} range={range} rangeLabel={rangeLabel} />
      </AsyncSection>
    </Stack>
  );
}

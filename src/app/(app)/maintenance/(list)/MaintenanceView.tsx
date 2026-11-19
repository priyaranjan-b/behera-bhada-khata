"use client";

import { useCallback, useState, useTransition } from "react";
import Stack from "@mui/material/Stack";
import AsyncSection from "@/components/ui/AsyncSection";
import StatCardRow from "@/components/ui/StatCardRow";
import { api } from "@/lib/api-client";
import type { MaintenanceTotals } from "@/lib/contracts";
import type { DayRange } from "@/lib/domain/payments";
import MaintenanceStatCards from "./MaintenanceStatCards";
import MaintenanceTable, { useMaintenanceGrid } from "./MaintenanceTable";
import { MAINTENANCE_SKELETONS as SKELETON } from "./maintenanceSkeletons";
import { MAINTENANCE_STAT_COLUMNS } from "./maintenanceStatColumns";

/**
 * The Maintenance page below its header: the stat cards and the table, each
 * loading on its own (A12, A18).
 * - The cards are the days' totals (`/maintenance/totals`): the page starts the
 *   call and passes the promise, read here with `use()`. The table's search,
 *   filters and a tapped card never change them; a card only filters the
 *   table (A28).
 * - The table loads each page in the browser over `GET /api/dashboard/maintenance`.
 * - A "Paid by" edit changes the payer cards, so it fetches the totals again
 *   (in a transition: the old cards stay until the new ones arrive).
 * Key it by the days: a new range starts again from page 1.
 */
export default function MaintenanceView({
  totals: initialTotals,
  range,
  rangeLabel,
  tagSuggestions,
}: {
  /** The stat cards' figures for the days, whatever the table shows. */
  totals: Promise<MaintenanceTotals>;
  range: DayRange;
  rangeLabel: string;
  /** Who-paid names for the tag editor and the Paid by filter. */
  tagSuggestions: Promise<string[]>;
}) {
  const grid = useMaintenanceGrid(range);
  const [totals, setTotals] = useState(initialTotals);
  const [, startTransition] = useTransition();
  const { from, to } = range;
  const refreshTotals = useCallback(
    () => startTransition(() => setTotals(api.dashboard.maintenance.totals({ from, to }))),
    [from, to]
  );
  return (
    <Stack spacing={2}>
      <StatCardRow columns={MAINTENANCE_STAT_COLUMNS} label="Maintenance totals">
        <AsyncSection title="Maintenance totals" fallback={SKELETON.cards} wide>
          <MaintenanceStatCards totals={totals} filter={grid.filter} setFilter={grid.setFilter} rangeLabel={rangeLabel} />
        </AsyncSection>
      </StatCardRow>
      <AsyncSection title="Maintenance" fallback={SKELETON.table}>
        <MaintenanceTable grid={grid} rangeLabel={rangeLabel} tagSuggestions={tagSuggestions} onPayersChanged={refreshTotals} />
      </AsyncSection>
    </Stack>
  );
}

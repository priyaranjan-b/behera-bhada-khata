import type { MaintenancePage } from "@/lib/contracts";
import type { DayRange } from "@/lib/domain/payments";
import MaintenanceView from "../MaintenanceView";

/** Maintenance: the cards and the table, one page at a time (A15); the cards follow its search and filters. */
export default async function MaintenanceSection({
  grid,
  tagSuggestions,
  range,
  rangeLabel,
}: {
  grid: Promise<MaintenancePage>;
  /** Who-paid names for the tag editor and the Paid by filter. */
  tagSuggestions: Promise<string[]>;
  range: DayRange;
  rangeLabel: string;
}) {
  const [initial, suggestions] = await Promise.all([grid, tagSuggestions]);
  return <MaintenanceView initial={initial} range={range} rangeLabel={rangeLabel} tagSuggestions={suggestions} />;
}

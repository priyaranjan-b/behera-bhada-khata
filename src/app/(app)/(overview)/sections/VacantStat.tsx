import type { HouseCounts } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import StatCard from "@/components/ui/StatCard";

/** Overview: houses in use with nobody in them today. */
export default async function VacantStat({ houses }: { houses: Promise<HouseCounts> }) {
  const { total, vacant } = await houses;
  return (
    <StatCard
      title="Vacant houses"
      value={String(vacant)}
      caption={`Of ${total} house${total === 1 ? "" : "s"} in use`}
      badge={vacant > 0 ? { label: "To let", tone: "info" } : { label: "All let", tone: "success" }}
      href={routes.houses.list({ show: "vacant" })}
    />
  );
}

import type { OverviewMonth } from "@/lib/contracts";
import { formatMonth } from "@/lib/dates";
import SiteCollectionCard from "@/components/domain/SiteCollectionCard";

export default async function SitesSection({ month }: { month: Promise<OverviewMonth> }) {
  const { monthKey, sites } = await month;
  return <SiteCollectionCard sites={sites} monthLabel={formatMonth(monthKey)} />;
}

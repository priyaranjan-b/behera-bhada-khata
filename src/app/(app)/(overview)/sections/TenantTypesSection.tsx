import type { OverviewMonth } from "@/lib/contracts";
import { formatMonth } from "@/lib/dates";
import TenantTypesCard from "@/components/domain/TenantTypesCard";

export default async function TenantTypesSection({ month }: { month: Promise<OverviewMonth> }) {
  const { monthKey, kinds } = await month;
  return <TenantTypesCard kinds={kinds} monthLabel={formatMonth(monthKey)} />;
}

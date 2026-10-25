import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import type { OverviewMonth } from "@/lib/contracts";
import { formatMonth } from "@/lib/dates";
import { EmptyState } from "@/components/ui/DataDisplay";
import TenantStatusGrid from "../TenantStatusGrid";

/** Where the Expected / Collected cards jump to on this page. */
const MONTH_TENANTS_ANCHOR = "month-tenants";

/** Overview: every tenant's rent for the month, filterable by status (`?show=`). */
export default async function MonthTenantsSection({ month, show }: { month: Promise<OverviewMonth>; show?: string }) {
  const { monthKey, report } = await month;
  return (
    <TenantStatusGrid
      key={`${monthKey}-${show ?? ""}`}
      id={MONTH_TENANTS_ANCHOR}
      initialShow={show}
      rows={report.rows}
      monthLabel={formatMonth(monthKey)}
      emptyState={
        <EmptyState
          icon={<PeopleOutlineIcon />}
          title="No active tenants yet"
          description="Add a property and a tenant to start tracking rent."
        />
      }
    />
  );
}

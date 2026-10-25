import Grid from "@mui/material/Grid";
import type { TenantAccount } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";

/** Grid cell of one account stat card. */
export const ACCOUNT_STAT_CELL = { xs: 6, md: 3 } as const;

/** Tenant page: Outstanding and Months overdue - two grid cells. */
export default async function AccountStats({ account }: { account: Promise<TenantAccount> }) {
  const { balance, periods } = await account;
  const thisMonth = currentMonthKey();
  const lastMonth = formatMonth(addMonthsToKey(thisMonth, -1));
  // Only months that have ended are owed (summarizeBalance); later ones are billed ahead.
  const ended = periods.filter((p) => p.periodMonth < thisMonth);
  const paidMonths = ended.filter((p) => p.status === "paid").length;
  return (
    <>
      <Grid size={ACCOUNT_STAT_CELL}>
        <StatCard
          title="Outstanding"
          value={formatMoney(balance.totalOutstanding)}
          caption={
            balance.notYetDue > 0
              ? `To end of ${lastMonth} · ${formatMoney(balance.notYetDue)} not due yet`
              : `To end of ${lastMonth}`
          }
          badge={
            balance.totalOutstanding > 0 ? { label: "To collect", tone: "warning" } : { label: "Settled", tone: "success" }
          }
        />
      </Grid>
      <Grid size={ACCOUNT_STAT_CELL}>
        <StatCard
          title="Months overdue"
          value={String(balance.overdueMonths)}
          caption={`${paidMonths} of ${ended.length} ended month${ended.length === 1 ? "" : "s"} paid`}
          badge={
            balance.overdueMonths > 0 ? { label: "Follow up", tone: "danger" } : { label: "On track", tone: "success" }
          }
        />
      </Grid>
    </>
  );
}

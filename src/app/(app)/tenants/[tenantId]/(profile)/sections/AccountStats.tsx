import Grid from "@mui/material/Grid";
import type { TenantAccount } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";
import { StatCardSkeleton } from "@/components/ui/Skeletons";

/** Grid cell of one account stat card. */
const ACCOUNT_STAT_CELL = { xs: 6 } as const;

/** `AccountStats` while the account loads: the same two grid cells. */
export function AccountStatsSkeleton() {
  return [0, 1].map((i) => (
    <Grid key={i} size={ACCOUNT_STAT_CELL}>
      <StatCardSkeleton />
    </Grid>
  ));
}

/** Tenant page: Outstanding and Months overdue - two cells of a `Grid container`. */
export default async function AccountStats({ account }: { account: Promise<TenantAccount> }) {
  const { balance, endedMonths, paidEndedMonths } = await account;
  const lastMonth = formatMonth(addMonthsToKey(currentMonthKey(), -1));
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
          caption={`${paidEndedMonths} of ${endedMonths} ended month${endedMonths === 1 ? "" : "s"} paid`}
          badge={
            balance.overdueMonths > 0 ? { label: "Follow up", tone: "danger" } : { label: "On track", tone: "success" }
          }
        />
      </Grid>
    </>
  );
}

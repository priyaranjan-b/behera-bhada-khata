import Grid from "@mui/material/Grid";
import type { TenantAccount } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import TabStatCard from "@/components/ui/TabStatCard";
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

/**
 * The same two figures for the reader at hand: the owner collects ("To
 * collect", "Follow up"), the tenant pays ("You owe", "Please pay"). One
 * set of words never serves both: "To collect" read by a tenant sounds like
 * money coming to them (A32).
 */
const WORDING = {
  owner: {
    owedTitle: "Outstanding",
    owing: { label: "To collect", tone: "warning" },
    clear: { label: "Settled", tone: "success" },
    monthsTitle: "Months overdue",
    behind: { label: "Follow up", tone: "danger" },
    onTrack: { label: "On track", tone: "success" },
  },
  tenant: {
    owedTitle: "You owe",
    owing: { label: "Please pay", tone: "warning" },
    clear: { label: "Nothing due", tone: "success" },
    monthsTitle: "Months unpaid",
    behind: { label: "Unpaid", tone: "warning" },
    onTrack: { label: "All paid", tone: "success" },
  },
} as const;

/**
 * Tenant page: what is owed and how many months are unpaid - two cells of a
 * `Grid container`, each opening the tab it comes from (the ledger, the rent
 * months) in the browser (`TabStatCard`), so the page's kept tabs don't
 * reload. `audience`: the owner's tenant page or the tenant's own (A32).
 */
export default async function AccountStats({
  account,
  audience = "owner",
}: {
  account: Promise<TenantAccount>;
  audience?: "owner" | "tenant";
}) {
  const { balance, endedMonths, paidEndedMonths } = await account;
  const words = WORDING[audience];
  const lastMonth = formatMonth(addMonthsToKey(currentMonthKey(), -1));
  const upTo = audience === "tenant" ? `Unpaid rent up to the end of ${lastMonth}` : `To end of ${lastMonth}`;
  return (
    <>
      <Grid size={ACCOUNT_STAT_CELL}>
        <TabStatCard
          title={words.owedTitle}
          icon={<AccountBalanceWalletRoundedIcon />}
          variant={balance.totalOutstanding > 0 ? "highlighted" : "default"}
          value={formatMoney(balance.totalOutstanding)}
          tab="ledger"
          caption={balance.notYetDue > 0 ? `${upTo} · ${formatMoney(balance.notYetDue)} not due yet` : upTo}
          badge={balance.totalOutstanding > 0 ? words.owing : words.clear}
        />
      </Grid>
      <Grid size={ACCOUNT_STAT_CELL}>
        <TabStatCard
          title={words.monthsTitle}
          icon={<EventBusyRoundedIcon />}
          value={String(balance.overdueMonths)}
          tab="months"
          caption={`${paidEndedMonths} of ${endedMonths} ended month${endedMonths === 1 ? "" : "s"} paid`}
          badge={balance.overdueMonths > 0 ? words.behind : words.onTrack}
        />
      </Grid>
    </>
  );
}

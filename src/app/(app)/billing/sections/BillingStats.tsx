import type { StatCardRowColumns } from "@/components/ui/StatCardRow";
import type { BillingTotalsView } from "@/lib/contracts";
import { collectionRateTone } from "@/lib/domain/overview";
import { formatMoney } from "@/lib/money";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import StatCard from "@/components/ui/StatCard";

/** The Billing stat cards (Received is the fourth): a swipe row on phones, two a row, four from `lg` (A26). */
export const BILLING_STAT_COLUMNS = { sm: 2, lg: 4 } as const satisfies StatCardRowColumns;

/** Billing: Billed, Collected and Balance for the range - three cards in the stat row. */
export default async function BillingStats({
  totals: totalsPromise,
  rangeLabel,
}: {
  totals: Promise<BillingTotalsView>;
  rangeLabel: string;
}) {
  const totals = await totalsPromise;
  const tenantCount = totals.tenants;
  return (
    <>
      <StatCard
        title="Billed"
        icon={<ReceiptLongRoundedIcon />}
        tone="primary"
        value={formatMoney(totals.billed)}
        caption={`${rangeLabel} · ${tenantCount} tenant${tenantCount === 1 ? "" : "s"}`}
      />
      <StatCard
        title="Collected"
        icon={<SavingsRoundedIcon />}
        value={formatMoney(totals.collected)}
        caption="Paid towards these months"
        badge={
          totals.collectionRate === null
            ? undefined
            : { label: `${totals.collectionRate}%`, tone: collectionRateTone(totals.collectionRate) }
        }
      />
      <StatCard
        title="Balance"
        icon={<AccountBalanceWalletRoundedIcon />}
        variant="gradient"
        value={formatMoney(totals.balance)}
        caption={totals.overdue > 0 ? `${formatMoney(totals.overdue)} overdue` : "Nothing overdue"}
        badge={totals.balance > 0 ? { label: "To collect", tone: "warning" } : { label: "Settled", tone: "success" }}
      />
    </>
  );
}

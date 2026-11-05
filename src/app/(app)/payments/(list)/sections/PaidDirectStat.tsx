import type { PaymentsPaidDirect } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import StatCard from "@/components/ui/StatCard";

/** Govt rent paid to the bank directly (A11): by rent month, so the table's search doesn't apply. */
export default async function PaidDirectStat({
  paidDirect,
  href,
}: {
  paidDirect: Promise<PaymentsPaidDirect>;
  /** The Billing page for those rent months, with Govt paid direct shown (where these figures come from). */
  href: string;
}) {
  const { amount, months, tenants } = await paidDirect;
  return (
    <StatCard
      title="Govt paid direct"
      icon={<AccountBalanceWalletRoundedIcon />}
      tone="info"
      value={formatMoney(amount)}
      href={href}
      caption={
        months === 0
          ? "None for these rent months"
          : `${tenants} tenant${tenants === 1 ? "" : "s"} · by rent month, not searched`
      }
    />
  );
}

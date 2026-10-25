import type { BillingReceived } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";

/** Billing: cash dated in the range's months, whatever months it paid for. */
export default async function ReceivedStat({ received, months }: { received: Promise<BillingReceived>; months: number }) {
  const { amount, payments, paidDirect } = await received;
  return (
    <StatCard
      title="Received"
      value={formatMoney(amount)}
      caption={
        `${payments} payment${payments === 1 ? "" : "s"} dated in ${months === 1 ? "this month" : "these months"}` +
        (paidDirect > 0 ? ` + ${formatMoney(paidDirect)} Govt paid direct` : "")
      }
    />
  );
}

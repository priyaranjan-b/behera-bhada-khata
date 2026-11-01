import type { PaymentsPaidDirect } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";

/** Govt rent paid to the bank directly (A11): by rent month, so the table's search doesn't apply. */
export default async function PaidDirectStat({ paidDirect }: { paidDirect: Promise<PaymentsPaidDirect> }) {
  const { amount, months, tenants } = await paidDirect;
  return (
    <StatCard
      title="Govt paid direct"
      value={formatMoney(amount)}
      caption={
        months === 0
          ? "None for these rent months"
          : `${tenants} tenant${tenants === 1 ? "" : "s"} · by rent month, not searched`
      }
    />
  );
}

import type { OverviewMonth } from "@/lib/contracts";
import PaidDirectToggle from "@/components/domain/PaidDirectToggle";

/** Header: "Include Govt paid direct", only when there are such tenants. */
export default async function PaidDirectSwitch({ month }: { month: Promise<OverviewMonth> }) {
  const { paidDirect } = await month;
  return paidDirect.available ? <PaidDirectToggle shown={paidDirect.shown} /> : null;
}

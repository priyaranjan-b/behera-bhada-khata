import type { PaidDirectState } from "@/lib/contracts";
import PaidDirectToggle from "@/components/domain/PaidDirectToggle";

/** Header: "Include Govt paid direct", only when there are such tenants. */
export default async function PaidDirectSwitch({ state }: { state: Promise<PaidDirectState> }) {
  const paidDirect = await state;
  return paidDirect.available ? <PaidDirectToggle shown={paidDirect.shown} /> : null;
}

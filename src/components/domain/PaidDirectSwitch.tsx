import type { PaidDirectState } from "@/lib/contracts";
import PaidDirectToggle from "@/components/domain/PaidDirectToggle";

/** In the context bar of Overview, Billing and Earnings (A24): "Include Govt paid direct", only when there are such tenants (A11). */
export default async function PaidDirectSwitch({ state }: { state: Promise<PaidDirectState> }) {
  const paidDirect = await state;
  return paidDirect.available ? <PaidDirectToggle shown={paidDirect.shown} /> : null;
}

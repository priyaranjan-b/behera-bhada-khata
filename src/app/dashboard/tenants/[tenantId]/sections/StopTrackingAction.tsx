import type { TenantAccount } from "@/lib/contracts";
import RentTrackingButton from "@/components/domain/RentTrackingButton";

/** Details: "Stop tracking" for a government tenant, only while nothing is recorded (0016). */
export default async function StopTrackingAction({
  tenantId,
  account,
}: {
  tenantId: string;
  account: Promise<TenantAccount>;
}) {
  const { canStopRentTracking } = await account;
  return canStopRentTracking ? <RentTrackingButton mode="stop" tenantId={tenantId} /> : null;
}

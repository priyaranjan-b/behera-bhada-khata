import type { TenantAccount } from "@/lib/contracts";
import StopRentTrackingButton from "@/components/domain/StopRentTrackingButton";

/** Details: "Stop tracking" for a government tenant, only while nothing is recorded (0016). */
export default async function StopTrackingAction({
  tenantId,
  account,
}: {
  tenantId: string;
  account: Promise<TenantAccount>;
}) {
  const { canStopRentTracking } = await account;
  return canStopRentTracking ? <StopRentTrackingButton tenantId={tenantId} /> : null;
}

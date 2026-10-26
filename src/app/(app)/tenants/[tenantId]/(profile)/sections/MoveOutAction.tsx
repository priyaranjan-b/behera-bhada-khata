import type { TenantAccount } from "@/lib/contracts";
import MoveOutButton from "@/components/domain/MoveOutButton";

/** Header: Move out, once the account says what's still owed (its confirm text shows it). */
export default async function MoveOutAction({
  account,
  ...props
}: {
  account: Promise<TenantAccount>;
  tenantId: string;
  tenantName: string;
  unitCodes: string[];
}) {
  const { balance } = await account;
  return <MoveOutButton {...props} outstanding={balance.totalOutstanding} />;
}

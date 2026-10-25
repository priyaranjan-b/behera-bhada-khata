import type { TenantLedgerView } from "@/lib/contracts";
import TenantLedgerTable from "../TenantLedgerTable";

/** Tenant page: payments and adjustments, with receipts, proofs and Send link. */
export default async function LedgerSection({ tenantId, ledger }: { tenantId: string; ledger: Promise<TenantLedgerView> }) {
  const { ledger: rows, tenantMessaging } = await ledger;
  return <TenantLedgerTable rows={rows} tenantId={tenantId} tenantMessaging={tenantMessaging} />;
}

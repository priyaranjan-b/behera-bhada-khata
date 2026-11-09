"use client";

import Button from "@mui/material/Button";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { GridCell } from "@/components/ui";
import ProofsButton from "@/components/domain/ProofsButton";
import { apiHref, apiPaths } from "@/lib/api-client";
import type { LedgerRow } from "@/lib/domain/tenantLedger";

/**
 * A ledger row's actions for the signed-in tenant (the portal, A32): their
 * receipt and the proofs on their payment, nothing that changes anything.
 */
export default function TenantReceiptActions({ row }: { row: LedgerRow }) {
  if (row.type === "charge" || !row.refId) return null;
  const receiptHref = apiHref(
    row.type === "payment" ? apiPaths.tenant.paymentReceipt(row.refId) : apiPaths.tenant.adjustmentReceipt(row.refId)
  );
  return (
    <GridCell align="end">
      {row.type === "payment" ? <ProofsButton paymentId={row.refId} proofs={row.proofs ?? []} source="tenant" /> : null}
      <Button
        size="small"
        startIcon={<DownloadRoundedIcon />}
        href={receiptHref}
        download
        aria-label={`Download receipt ${row.receiptNo ?? ""}`.trim()}
      >
        Receipt
      </Button>
    </GridCell>
  );
}

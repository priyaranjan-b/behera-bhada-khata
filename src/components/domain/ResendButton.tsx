"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import { api } from "@/lib/api-client";

/** Rotates a record's acknowledge link and (re)sends it to the record's tenant, until they've signed. */
export default function ResendButton({
  kind,
  recordId,
  tenantId,
}: {
  kind: "payment" | "adjustment";
  recordId: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const resend = kind === "payment" ? api.dashboard.payments.resend : api.dashboard.adjustments.resend;
    const flash = await resend(recordId).then(
      ({ notified }) => (notified ? "resent=1" : "notifyFailed=1"),
      () => "error=1"
    );
    setBusy(false);
    router.push(`/dashboard/tenants/${tenantId}?${flash}`);
    router.refresh();
  }

  return (
    <Button size="small" onClick={handleClick} disabled={busy}>
      Send link
    </Button>
  );
}

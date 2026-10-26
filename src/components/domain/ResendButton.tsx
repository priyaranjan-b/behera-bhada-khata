"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import { api } from "@/lib/api-client";
import { routes, type Flash } from "@/lib/routes";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

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
  const router = useAppRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const resend = kind === "payment" ? api.dashboard.payments.resend : api.dashboard.adjustments.resend;
    const flash: Flash = await resend(recordId).then(
      ({ notified }) => (notified ? { resent: "1" } : { notifyFailed: "1" }),
      () => ({ error: "1" })
    );
    setBusy(false);
    router.push(routes.tenants.detail(tenantId, { ...flash, tab: "ledger" }));
    router.refresh();
  }

  return (
    <LoadingButton size="small" onClick={handleClick} loading={busy}>
      Send link
    </LoadingButton>
  );
}

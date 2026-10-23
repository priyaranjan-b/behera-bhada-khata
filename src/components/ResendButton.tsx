"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import { api } from "@/lib/api-client";

export default function ResendButton({
  kind,
  recordId,
  tenantId,
  amount,
}: {
  kind: "payment" | "adjustment";
  recordId: string;
  tenantId: string;
  amount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const resend = kind === "payment" ? api.dashboard.payments.resend : api.dashboard.adjustments.resend;
    const ok = await resend(recordId, { tenantId, amount }).then(
      () => true,
      () => false
    );
    setBusy(false);
    router.push(`/dashboard/tenants/${tenantId}?${ok ? "resent=1" : "error=1"}`);
    router.refresh();
  }

  return (
    <Button size="small" onClick={handleClick} disabled={busy}>
      Resend
    </Button>
  );
}

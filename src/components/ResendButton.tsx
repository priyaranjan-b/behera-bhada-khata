"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";

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
    const endpoint = kind === "payment" ? `/api/payments/${recordId}/resend` : `/api/adjustments/${recordId}/resend`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, amount }),
    });
    setBusy(false);
    router.push(`/dashboard/tenants/${tenantId}?${res.ok ? "resent=1" : "error=1"}`);
    router.refresh();
  }

  return (
    <Button size="small" onClick={handleClick} disabled={busy}>
      Resend
    </Button>
  );
}

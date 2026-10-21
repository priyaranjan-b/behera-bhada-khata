"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { formatMoney, round2 } from "@/lib/money";

export interface AdjustablePeriod {
  rentPeriodId: string;
  periodMonth: string;
  originallyAllocated: number;
}

export default function AdjustmentForm({
  paymentId,
  periods,
}: {
  paymentId: string;
  periods: AdjustablePeriod[];
}) {
  const router = useRouter();
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padHandle = useRef<SignaturePadHandle | null>(null);

  const allocations = useMemo(
    () =>
      Object.entries(deltas)
        .filter(([, amount]) => amount !== 0)
        .map(([rentPeriodId, amountDelta]) => ({ rentPeriodId, amountDelta })),
    [deltas]
  );
  const total = round2(allocations.reduce((sum, a) => sum + a.amountDelta, 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!padHandle.current || padHandle.current.isEmpty()) {
      setError("Please sign before saving");
      return;
    }
    if (allocations.length === 0) {
      setError("Enter a non-zero adjustment for at least one month");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Explain what's being corrected");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deltaAmount: total,
          reason: reason.trim(),
          allocations,
          ownerSignaturePng: padHandle.current.toPngDataUrl(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that adjustment.");
      router.push(`/dashboard/tenants/${body.tenantId}?paymentCreated=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 520 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Adjust by month (negative to reduce, positive to add)
          </Typography>
          <Stack spacing={1.5}>
            {periods.map((p) => (
              <Stack
                key={p.rentPeriodId}
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="body2">
                  {new Date(`${p.periodMonth}T00:00:00Z`).toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  <Typography component="span" variant="body2" color="textSecondary">
                    (originally {formatMoney(p.originallyAllocated)})
                  </Typography>
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  value={deltas[p.rentPeriodId] ?? 0}
                  onChange={(e) => setDeltas((prev) => ({ ...prev, [p.rentPeriodId]: Number(e.target.value) || 0 }))}
                  slotProps={{ htmlInput: { step: "0.01", style: { textAlign: "right" } } }}
                  sx={{ width: 130 }}
                />
              </Stack>
            ))}
          </Stack>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Net change: <strong>{formatMoney(total)}</strong>
          </Typography>
        </Box>

        <TextField
          id="reason"
          label="Reason for this correction"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          multiline
          rows={3}
          fullWidth
        />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Owner signature
          </Typography>
          <Paper variant="outlined" sx={{ p: 0.5 }}>
            <SignaturePad onReady={(handle) => (padHandle.current = handle)} />
          </Paper>
          <Button size="small" onClick={() => padHandle.current?.clear()} sx={{ mt: 0.5 }}>
            Clear
          </Button>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? "Saving…" : "Save & send for confirmation"}
        </Button>
      </Stack>
    </Box>
  );
}

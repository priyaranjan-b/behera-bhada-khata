"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { suggestAllocations, type PeriodLike } from "@/lib/allocation";
import { formatMoney } from "@/lib/money";

export default function PaymentForm({
  tenantId,
  periods,
}: {
  tenantId: string;
  periods: PeriodLike[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [manualAllocations, setManualAllocations] = useState<Record<string, number> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padHandle = useRef<SignaturePadHandle | null>(null);

  const amountNumber = Number(amount) || 0;
  const suggested = useMemo(() => suggestAllocations(periods, amountNumber), [periods, amountNumber]);
  const allocations = manualAllocations
    ? suggested.map((s) => ({ ...s, amountAllocated: manualAllocations[s.rentPeriodId] ?? s.amountAllocated }))
    : suggested;

  function updateAllocation(rentPeriodId: string, value: number) {
    const base: Record<string, number> = manualAllocations
      ? { ...manualAllocations }
      : Object.fromEntries(suggested.map((s) => [s.rentPeriodId, s.amountAllocated]));
    base[rentPeriodId] = value;
    setManualAllocations(base);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!padHandle.current || padHandle.current.isEmpty()) {
      setError("Please sign before saving");
      return;
    }
    if (allocations.length === 0) {
      setError("This amount doesn't cover any outstanding period");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNumber,
          paymentDate,
          mode,
          note: note || undefined,
          allocations: allocations.map((a) => ({ rentPeriodId: a.rentPeriodId, amountAllocated: a.amountAllocated })),
          ownerSignaturePng: padHandle.current.toPngDataUrl(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that payment.");
      router.push(`/dashboard/tenants/${tenantId}?paymentCreated=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 520 }}>
      <Stack spacing={2.5}>
        <TextField
          id="amount"
          label="Amount received"
          type="number"
          required
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setManualAllocations(null);
          }}
          slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
          fullWidth
        />

        <TextField
          id="paymentDate"
          label="Date received"
          type="date"
          required
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />

        <TextField id="mode" label="Mode" select value={mode} onChange={(e) => setMode(e.target.value)} fullWidth>
          <MenuItem value="cash">Cash</MenuItem>
          <MenuItem value="bank_transfer">Bank transfer</MenuItem>
          <MenuItem value="upi">UPI</MenuItem>
          <MenuItem value="cheque">Cheque</MenuItem>
          <MenuItem value="other">Other</MenuItem>
        </TextField>

        <TextField
          id="note"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
        />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Covers
          </Typography>
          {allocations.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              Enter an amount to see which months this covers.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {allocations.map((a) => (
                <Stack
                  key={a.rentPeriodId}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="body2">
                    {new Date(`${a.periodMonth}T00:00:00Z`).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    <Typography component="span" variant="body2" color="textSecondary">
                      (outstanding {formatMoney(a.amountOutstanding)})
                    </Typography>
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    value={a.amountAllocated}
                    onChange={(e) => updateAllocation(a.rentPeriodId, Number(e.target.value) || 0)}
                    slotProps={{ htmlInput: { step: "0.01", min: 0, max: a.amountOutstanding, style: { textAlign: "right" } } }}
                    sx={{ width: 130 }}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Box>

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

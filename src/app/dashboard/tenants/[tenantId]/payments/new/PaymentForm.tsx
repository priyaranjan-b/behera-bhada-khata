"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { type SignaturePadHandle } from "@/components/ui/SignaturePad";
import { StatusBadge } from "@/components/ui/DataDisplay";
import {
  AmountRow,
  BadgeRow,
  FileAttachmentsField,
  FormActions,
  SectionCard,
  SignatureField,
  SummaryLine,
} from "@/components/ui";
import { suggestAllocations, type PeriodLike } from "@/lib/domain/allocation";
import { formatMonth, todayKey } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import NotifyTenantField, { recordedFlash } from "@/components/domain/NotifyTenantField";
import { prepareProofFile } from "@/lib/proofImages";
import { PROOF_LIMITS } from "@/lib/validation";
import { api, errorMessage } from "@/lib/api-client";
import type { CreatePaymentInput } from "@/lib/contracts";

export default function PaymentForm({
  tenantId,
  periods,
  inDialog = false,
}: {
  tenantId: string;
  periods: PeriodLike[];
  /** Rendered in the tenant page's `RouteModal` rather than as its own page. */
  inDialog?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => todayKey());
  const [mode, setMode] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [notify, setNotify] = useState(true);
  const [manualAllocations, setManualAllocations] = useState<Record<string, number> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padHandle = useRef<SignaturePadHandle | null>(null);

  const amountNumber = Number(amount) || 0;
  const suggested = useMemo(() => suggestAllocations(periods, amountNumber), [periods, amountNumber]);
  const allocations = manualAllocations
    ? suggested.map((s) => ({ ...s, amountAllocated: manualAllocations[s.rentPeriodId] ?? s.amountAllocated }))
    : suggested;
  const allocatedTotal = round2(allocations.reduce((sum, a) => sum + a.amountAllocated, 0));
  const unallocated = round2(amountNumber - allocatedTotal);
  const totalOutstanding = round2(
    periods.reduce((sum, p) => sum + Number(p.amount_due) - Number(p.amount_allocated), 0),
  );

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
      const { notified } = await api.dashboard.tenants.createPayment(
        tenantId,
        {
          amount: amountNumber,
          paymentDate,
          mode: mode as CreatePaymentInput["mode"],
          note: note || undefined,
          allocations: allocations.map((a) => ({ rentPeriodId: a.rentPeriodId, amountAllocated: a.amountAllocated })),
          ownerSignaturePng: padHandle.current.toPngDataUrl(),
          notifyTenant: notify,
        },
        proofs
      );
      const href = `/dashboard/tenants/${tenantId}?${recordedFlash(notified)}`;
      // In the dialog, replace the form's history entry so Back doesn't reopen it.
      if (inDialog) router.replace(href);
      else router.push(href);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that payment."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <SectionCard title="Payment details">
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
            </SectionCard>

            <FileAttachmentsField
              title="Payment proof (optional)"
              caption="UPI or bank screenshot, cheque photo, deposit slip - kept with this payment."
              files={proofs}
              onChange={setProofs}
              accept={PROOF_LIMITS.accept}
              maxFiles={PROOF_LIMITS.maxFiles}
              maxTotalBytes={PROOF_LIMITS.maxTotalBytes}
              prepare={prepareProofFile}
              disabled={submitting}
            />

            <SignatureField title="Owner signature" onReady={(handle) => (padHandle.current = handle)} />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <SectionCard
            title="Covers"
            sticky={!inDialog}
            action={manualAllocations ? <StatusBadge tone="info" label="Edited" /> : undefined}
          >
            {allocations.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                Enter an amount to see which months this covers.
              </Typography>
            ) : (
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                {allocations.map((a) => (
                  <AmountRow
                    key={a.rentPeriodId}
                    label={formatMonth(a.periodMonth)}
                    caption={`outstanding ${formatMoney(a.amountOutstanding)}`}
                    value={a.amountAllocated}
                    onChange={(value) => updateAllocation(a.rentPeriodId, value)}
                    min={0}
                    max={a.amountOutstanding}
                  />
                ))}
              </Stack>
            )}

            <Divider />
            <Stack spacing={1}>
              <SummaryLine label="Total outstanding" value={formatMoney(totalOutstanding)} />
              <SummaryLine label="Amount received" value={formatMoney(amountNumber)} />
              <SummaryLine label="Allocated" value={formatMoney(allocatedTotal)} emphasis="strong" />
              {unallocated !== 0 && amountNumber > 0 ? (
                <BadgeRow>
                  <StatusBadge
                    tone="warning"
                    label={`${formatMoney(Math.abs(unallocated))} ${unallocated > 0 ? "not allocated" : "over-allocated"}`}
                  />
                </BadgeRow>
              ) : null}
            </Stack>
          </SectionCard>
        </Grid>

        <Grid size={12}>
          <NotifyTenantField checked={notify} onChange={setNotify} disabled={submitting} />
        </Grid>

        <Grid size={12}>
          <FormActions
            error={error}
            cancelHref={`/dashboard/tenants/${tenantId}`}
            onCancel={inDialog ? () => router.back() : undefined}
            submitLabel="Save payment"
            pendingLabel="Saving…"
            pending={submitting}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

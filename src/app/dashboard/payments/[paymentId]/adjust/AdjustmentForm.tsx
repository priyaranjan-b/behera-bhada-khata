"use client";

import { useMemo, useRef, useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import { StatusBadge } from "@/components/ui/DataDisplay";
import { AmountRow, FormActions, SectionCard, SummaryLine } from "@/components/ui";
import { OwnerSignatureField, type OwnerSignatureHandle } from "@/components/domain/OwnerSignatureField";
import { formatMonth } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { api, errorMessage } from "@/lib/api-client";
import type { AdjustablePeriod, SavedSignature } from "@/lib/contracts";
import NotifyTenantField, { recordedFlash } from "@/components/domain/NotifyTenantField";

export default function AdjustmentForm({
  paymentId,
  periods,
  tenantId,
  originalAmount,
  savedSignature,
}: {
  paymentId: string;
  periods: AdjustablePeriod[];
  tenantId: string;
  originalAmount: number;
  /** From the Profile page; used unless the owner signs by hand. */
  savedSignature: SavedSignature | null;
}) {
  const router = useAppRouter();
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureHandle = useRef<OwnerSignatureHandle | null>(null);

  const allocations = useMemo(
    () =>
      Object.entries(deltas)
        .filter(([, amount]) => amount !== 0)
        .map(([rentPeriodId, amountDelta]) => ({ rentPeriodId, amountDelta })),
    [deltas],
  );
  const total = round2(allocations.reduce((sum, a) => sum + a.amountDelta, 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const signature = signatureHandle.current?.value();
    if (signature === null) {
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
      const created = await api.dashboard.payments.createAdjustment(paymentId, {
        deltaAmount: total,
        reason: reason.trim(),
        allocations,
        ownerSignaturePng: signature,
        notifyTenant: notify,
      });
      router.push(`/dashboard/tenants/${created.tenantId}?${recordedFlash(created.notified)}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that adjustment."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <SectionCard title="Adjust by month" caption="Negative to reduce, positive to add">
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                {periods.map((p) => (
                  <AmountRow
                    key={p.rentPeriodId}
                    label={formatMonth(p.periodMonth)}
                    ariaLabel={`Adjustment for ${formatMonth(p.periodMonth)}`}
                    caption={`originally ${formatMoney(p.originallyAllocated)}`}
                    value={deltas[p.rentPeriodId] ?? 0}
                    onChange={(value) => setDeltas((prev) => ({ ...prev, [p.rentPeriodId]: value }))}
                  />
                ))}
              </Stack>
            </SectionCard>

            <SectionCard title="Reason">
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
            </SectionCard>

            <OwnerSignatureField saved={savedSignature} onReady={(handle) => (signatureHandle.current = handle)} />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <SectionCard
            title="Summary"
            sticky
            action={
              total !== 0 ? (
                <StatusBadge tone={total > 0 ? "info" : "warning"} label={total > 0 ? "Increase" : "Decrease"} />
              ) : (
                <StatusBadge tone="neutral" label="No change" />
              )
            }
          >
            <Stack spacing={1}>
              <SummaryLine label="Original payment" value={formatMoney(originalAmount)} />
              <SummaryLine label="Net change" value={formatMoney(total)} emphasis="strong" />
              <Divider />
              <SummaryLine label="After correction" value={formatMoney(round2(originalAmount + total))} />
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
            submitLabel="Save correction"
            pendingLabel="Saving…"
            pending={submitting}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

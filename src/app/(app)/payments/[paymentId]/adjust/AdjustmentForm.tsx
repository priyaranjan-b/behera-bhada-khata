"use client";

import { useMemo, useRef, useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import { useCorrectionSubmit } from "@/components/domain/useCorrectionSubmit";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import { StatusBadge } from "@/components/ui/DataDisplay";
import { AmountRow, CorrectionDialog, DetailList, DetailRow, FormActions, SectionCard, SummaryLine } from "@/components/ui";
import { OwnerSignatureField, type OwnerSignatureHandle } from "@/components/domain/OwnerSignatureField";
import { formatMonth } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { api } from "@/lib/api-client";
import type { AdjustablePeriod, CreatedAdjustment, SavedSignature } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import NotifyTenantField, { recordedFlash } from "@/components/domain/NotifyTenantField";

/**
 * Corrects a recorded payment with an adjustment (create_adjustment). The
 * page is the fix; "Save correction" opens the review and the corrections
 * PIN (0039) before anything is saved.
 */
export default function AdjustmentForm({
  paymentId,
  periods,
  tenantId,
  originalAmount,
  savedSignature,
  tenantMessaging,
}: {
  paymentId: string;
  periods: AdjustablePeriod[];
  tenantId: string;
  originalAmount: number;
  /** From the Profile page; used unless the owner signs by hand. */
  savedSignature: SavedSignature | null;
  /** Twilio is set up, so the tenant can be sent a link. */
  tenantMessaging: boolean;
}) {
  const router = useAppRouter();
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(tenantMessaging);
  const [error, setError] = useState<string | null>(null);
  /** Set once the form checks out: the signature to send, and the review + PIN dialog is open. */
  const [ready, setReady] = useState<{ signature: string | undefined } | null>(null);
  const signatureHandle = useRef<OwnerSignatureHandle | null>(null);
  const correction = useCorrectionSubmit("Couldn't save that adjustment.", ready !== null);

  const allocations = useMemo(
    () =>
      Object.entries(deltas)
        .filter(([, amount]) => amount !== 0)
        .map(([rentPeriodId, amountDelta]) => ({ rentPeriodId, amountDelta })),
    [deltas],
  );
  const total = round2(allocations.reduce((sum, a) => sum + a.amountDelta, 0));

  function handleSubmit(e: React.FormEvent) {
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

    correction.clearErrors();
    setReady({ signature });
  }

  const confirm = (pin: string) => {
    let created: CreatedAdjustment | null = null;
    return correction.submit(
      async () => {
        created = await api.dashboard.payments.createAdjustment(paymentId, {
          deltaAmount: total,
          reason: reason.trim(),
          allocations,
          ownerSignaturePng: ready?.signature,
          notifyTenant: notify,
          pin,
        });
      },
      () => {
        if (created) router.push(routes.tenants.detail(created.tenantId, recordedFlash(created.notified)));
      }
    );
  };

  const monthLabel = new Map(periods.map((p) => [p.rentPeriodId, p]));

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
          <NotifyTenantField checked={notify} onChange={setNotify} disabled={correction.busy} available={tenantMessaging} />
        </Grid>

        <Grid size={12}>
          <FormActions
            error={error}
            cancelHref={routes.tenants.detail(tenantId)}
            submitLabel="Save correction"
            pendingLabel="Saving…"
            pending={correction.busy}
          />
        </Grid>
      </Grid>

      <CorrectionDialog
        open={ready !== null}
        title="Correct this payment"
        canReview
        confirmLabel="Save correction"
        maxWidth="sm"
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setReady(null)}
        onConfirm={confirm}
        review={
          <DetailList dividers>
            {allocations.map((a) => {
              const p = monthLabel.get(a.rentPeriodId);
              return (
                <DetailRow key={a.rentPeriodId} label={p ? formatMonth(p.periodMonth) : "Month"}>
                  {p ? `${formatMoney(p.originallyAllocated)} → ${formatMoney(round2(p.originallyAllocated + a.amountDelta))}` : formatMoney(a.amountDelta)}
                </DetailRow>
              );
            })}
            <DetailRow label="Payment counted">
              {formatMoney(originalAmount)} → {formatMoney(round2(originalAmount + total))}
            </DetailRow>
            <DetailRow label="Reason">{reason.trim()}</DetailRow>
            <DetailRow label="Tenant">{notify && tenantMessaging ? "Will be sent a link to acknowledge it" : "Won't be messaged"}</DetailRow>
          </DetailList>
        }
      />
    </Box>
  );
}

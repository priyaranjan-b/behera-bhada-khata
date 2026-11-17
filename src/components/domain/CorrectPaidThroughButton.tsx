"use client";

import { useState } from "react";
import { CorrectionDialog, DetailList, DetailRow, MonthField } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { api } from "@/lib/api-client";
import { addMonthsToKey, formatMonth, formatMonthRange, monthKeyOf, monthsBetween, yearMonthOf } from "@/lib/dates";
import { billingStartFor } from "@/lib/domain/tenant";
import { routes } from "@/lib/routes";
import { useCorrectionSubmit } from "./useCorrectionSubmit";

/**
 * Fixes "rent paid up to" for an active tenant (correct_paid_through, 0014):
 * billing then starts the month after. Payments already recorded stay on
 * their months. Reviewed and confirmed with the corrections PIN (0039).
 */
export default function CorrectPaidThroughButton({
  tenantId,
  leaseStart,
  billingStart,
}: {
  tenantId: string;
  leaseStart: string;
  billingStart: string;
}) {
  const router = useAppRouter();
  const current = yearMonthOf(addMonthsToKey(billingStart, -1));
  const [open, setOpen] = useState(false);
  const [paidThrough, setPaidThrough] = useState(current);
  const correction = useCorrectionSubmit("Couldn't change this.", open);

  const newStart = paidThrough ? billingStartFor(leaseStart, monthKeyOf(paidThrough)) : null;
  const changed = Boolean(newStart) && newStart !== billingStart;
  const added = newStart && newStart < billingStart ? monthsBetween(newStart, billingStart) : 0;
  const removed = newStart && newStart > billingStart ? monthsBetween(billingStart, newStart) : 0;

  const confirm = (pin: string) =>
    correction.submit(
      () => api.dashboard.tenants.correctPaidThrough(tenantId, { paidThrough, pin }),
      () => {
        setOpen(false);
        router.push(routes.tenants.detail(tenantId, { corrected: "1" }));
      }
    );

  return (
    <>
      <Button
        size="small"
        aria-label="Correct rent paid up to"
        startIcon={<LockRoundedIcon fontSize="small" />}
        onClick={() => {
          setPaidThrough(current);
          correction.clearErrors();
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <CorrectionDialog
        open={open}
        title='Correct "rent paid up to"'
        canReview={changed}
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        review={
          newStart && changed ? (
            <>
              <DetailList dividers>
                <DetailRow label="Billing from">
                  {formatMonth(billingStart)} → {formatMonth(newStart)}
                </DetailRow>
              </DetailList>
              <Alert severity={removed ? "warning" : "info"}>
                {added
                  ? `${formatMonthRange(newStart, addMonthsToKey(billingStart, -1))} (${added} ${added === 1 ? "month" : "months"}) will be added as owed.`
                  : `${formatMonthRange(billingStart, addMonthsToKey(newStart, -1))} (${removed} ${removed === 1 ? "month" : "months"}) will be removed. Not possible if a payment is recorded for one of them.`}
              </Alert>
            </>
          ) : null
        }
      >
        <Typography variant="body2" color="textSecondary">
          The last month this tenant paid before using the app. Billing starts the month after; payments already
          recorded stay on the months they were applied to.
        </Typography>
        <MonthField label="Rent paid up to" value={paidThrough} onChange={setPaidThrough} required fullWidth />
        {newStart && !changed ? (
          <Typography variant="body2" color="textSecondary">
            No change: billing already starts in {formatMonth(billingStart)}.
          </Typography>
        ) : null}
      </CorrectionDialog>
    </>
  );
}

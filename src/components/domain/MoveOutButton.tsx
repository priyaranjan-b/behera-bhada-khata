"use client";

import { useState } from "react";
import { CorrectionDialog, DateField, DetailList, DetailRow } from "@/components/ui";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { api, errorMessage } from "@/lib/api-client";
import { addMonthsToKey, currentMonthKey, formatMonth, formatMonthRange, monthKeyOf, todayKey } from "@/lib/dates";
import { moveOutNeedsPin, moveOutPinFrom } from "@/lib/domain/corrections";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { useCorrectionSubmit } from "./useCorrectionSubmit";
import { useDates } from "@/components/ui/DateFormat";

/**
 * Ends all of a tenant's houses on a date. Their ledger stays: dues up to the
 * move-out month remain to be collected, and the houses become free for the
 * next tenant from the following day. `disabled` is its placeholder while
 * the amount still owed (shown in the confirm text) loads. A date before
 * last month drops months that have ended, so it is a correction: "Review"
 * opens the review + corrections PIN dialog (0039); never for a `draft`.
 */
export default function MoveOutButton({
  tenantId,
  tenantName,
  unitCodes,
  outstanding,
  draft = false,
  disabled = false,
}: {
  tenantId: string;
  tenantName: string;
  unitCodes: string[];
  outstanding: number;
  draft?: boolean;
  disabled?: boolean;
}) {
  const { formatDate: formatDateKey } = useDates();
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correction = useCorrectionSubmit("Couldn't move this tenant out.", reviewing);

  const needsPin = !draft && Boolean(date) && moveOutNeedsPin(date);
  // Months after the move-out month up to this one are removed (later ones aren't billed yet).
  const firstRemoved = date ? addMonthsToKey(monthKeyOf(date), 1) : null;
  const lastRemoved = currentMonthKey();
  const done = () => {
    setOpen(false);
    setReviewing(false);
    router.push(routes.tenants.detail(tenantId, { movedOut: "1" }));
  };

  async function moveOut() {
    if (needsPin) {
      correction.clearErrors();
      setOpen(false);
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.moveOut(tenantId, { moveOutDate: date });
      done();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't move this tenant out."));
    } finally {
      setBusy(false);
    }
  }

  const confirm = (pin: string) =>
    correction.submit(() => api.dashboard.tenants.moveOut(tenantId, { moveOutDate: date, pin }), done);

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        startIcon={<LogoutRoundedIcon />}
        onClick={() => {
          // A fresh form each time: no date or error left from last time.
          setDate(todayKey());
          setError(null);
          setOpen(true);
        }}
        disabled={disabled}
      >
        Move out
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Move out {tenantName}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              {unitCodes.join(", ") || "Their houses"} will be free for a new tenant from the day after. Rent is billed
              up to and including the move-out month.
            </Typography>
            {outstanding > 0 ? (
              <Alert severity="warning">
                {needsPin
                  ? `${formatMoney(outstanding)} is owed now; the months removed come off it. The rest stays on their ledger.`
                  : `${formatMoney(outstanding)} is still owed. It stays on their ledger after they move out.`}
              </Alert>
            ) : null}
            <DateField label="Last day in the house" value={date} onChange={setDate} required fullWidth />
            {needsPin ? (
              <Alert severity="info">
                Before {formatDateKey(moveOutPinFrom())}, so months that have ended are removed: you&apos;ll review it and
                confirm with your corrections PIN.
              </Alert>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton variant="contained" color="error" onClick={moveOut} disabled={!date} loading={busy}>
            {needsPin ? "Review" : busy ? "Moving out…" : "Move out"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
      <CorrectionDialog
        open={reviewing}
        title={`Move out ${tenantName}`}
        canReview
        destructive
        confirmLabel="Move out"
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setReviewing(false)}
        onConfirm={confirm}
        review={
          date && firstRemoved ? (
            <>
              <DetailList dividers>
                <DetailRow label="Last day in the house">{formatDateKey(date)}</DetailRow>
                <DetailRow label="Billed up to">{formatMonth(monthKeyOf(date))}</DetailRow>
              </DetailList>
              {firstRemoved <= lastRemoved ? (
                <Alert severity="warning">
                  {formatMonthRange(firstRemoved, lastRemoved)} will be removed from their rent months. Not possible if a
                  payment is recorded for one of them.
                </Alert>
              ) : null}
            </>
          ) : null
        }
      />
    </>
  );
}

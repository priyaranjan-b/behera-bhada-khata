"use client";

import { useState } from "react";
import { CorrectionDialog, DateField, DetailList, DetailRow } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { api } from "@/lib/api-client";
import { addDaysToKey, addMonthsToKey, currentMonthKey, formatDateKey, formatMonth, formatMonthRange, monthKeyOf, monthsBetween } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { useCorrectionSubmit } from "./useCorrectionSubmit";

const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/** What the new date does to the months billed (or, untracked, counted as paid direct). */
function changeNote(oldMonth: string, newMonth: string, rentTracked: boolean): { severity: "info" | "warning"; text: string } {
  if (newMonth === oldMonth) return { severity: "info", text: "Same month, so the months billed stay the same." };
  const earlier = newMonth < oldMonth;
  const [from, to] = earlier ? [addMonthsToKey(newMonth, 1), oldMonth] : [addMonthsToKey(oldMonth, 1), newMonth];
  const n = monthsBetween(from, addMonthsToKey(to, 1));
  const range = formatMonthRange(from, to);
  if (!rentTracked) {
    // Govt paid direct (A11): their agreement rent counts as paid each month up to the move-out.
    return {
      severity: "info",
      text: earlier
        ? `Rent paid direct is counted up to ${formatMonth(newMonth)}: ${range} (${months(n)}) come off the reports.`
        : `Rent paid direct is counted up to ${formatMonth(newMonth)}: ${range} (${months(n)}) are added to the reports.`,
    };
  }
  if (earlier) {
    return {
      severity: "warning",
      text: `Billed up to ${formatMonth(newMonth)}: ${range} (${months(n)}) will be removed. Not possible if a payment is recorded for one of them.`,
    };
  }
  return {
    severity: "info",
    text:
      to >= currentMonthKey()
        ? `Billed up to ${formatMonth(newMonth)}: ${range} (${months(n)}) will be billed, each due when its month ends.`
        : `Billed up to ${formatMonth(newMonth)}: ${range} (${months(n)}) will be owed.`,
  };
}

/**
 * Fixes a moved-out tenant's move-out date (correct_move_out, 0037/0038):
 * their houses end on it and rent is billed up to its month. Payments
 * already recorded stay on their months. Reviewed and confirmed with the
 * corrections PIN (0039).
 */
export default function CorrectMoveOutButton({
  tenantId,
  movedOutOn,
  rentTracked,
  earliest,
}: {
  tenantId: string;
  movedOutOn: string;
  /** Untracked (Govt paid direct): no months billed, but paid-direct months on the reports. */
  rentTracked: boolean;
  /** earliestMoveOutDate: the last house taken, or billing start. */
  earliest: string | null;
}) {
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(movedOutOn);
  const correction = useCorrectionSubmit("Couldn't change this.", open);

  const oldMonth = monthKeyOf(movedOutOn);
  const changed = Boolean(date) && date !== movedOutOn;
  const note = changed ? changeNote(oldMonth, monthKeyOf(date), rentTracked) : null;

  // The usual mistake: the day the keys came back instead of the end of the last month paid for.
  // Offered only when the date isn't already a month-end, so one tap never drops a month that was right.
  const endOfMonthBefore = addDaysToKey(oldMonth, -1);
  const isMonthEnd = monthKeyOf(addDaysToKey(movedOutOn, 1)) === addDaysToKey(movedOutOn, 1);
  const quickPicks =
    !isMonthEnd && (!earliest || endOfMonthBefore >= earliest)
      ? [{ label: `End of ${formatMonth(monthKeyOf(endOfMonthBefore), "short")}`, value: endOfMonthBefore }]
      : undefined;

  const confirm = (pin: string) =>
    correction.submit(
      () => api.dashboard.tenants.correctMoveOut(tenantId, { moveOutDate: date, pin }),
      () => {
        setOpen(false);
        router.push(routes.tenants.detail(tenantId, { moveOutCorrected: "1" }));
      }
    );

  return (
    <>
      <Button
        size="small"
        aria-label="Correct move-out date"
        startIcon={<LockRoundedIcon fontSize="small" />}
        onClick={() => {
          setDate(movedOutOn);
          correction.clearErrors();
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <CorrectionDialog
        open={open}
        title="Correct the move-out date"
        canReview={changed}
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        review={
          note ? (
            <>
              <DetailList dividers>
                <DetailRow label="Last day in the house">
                  {formatDateKey(movedOutOn)} → {formatDateKey(date)}
                </DetailRow>
              </DetailList>
              <Alert severity={note.severity}>{note.text}</Alert>
            </>
          ) : null
        }
      >
        <Typography variant="body2" color="textSecondary">
          The last day in the house, now {formatDateKey(movedOutOn)}. Rent is billed up to and including its month,
          and the houses are free from the day after. Payments already recorded stay on the months they were applied
          to.
        </Typography>
        <DateField
          label="Last day in the house"
          value={date}
          onChange={setDate}
          min={earliest ?? undefined}
          required
          fullWidth
          quickPicks={quickPicks}
        />
      </CorrectionDialog>
    </>
  );
}

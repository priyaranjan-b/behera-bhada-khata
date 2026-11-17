"use client";

import { useState } from "react";
import { DateField } from "@/components/ui";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { api, errorMessage } from "@/lib/api-client";
import { addDaysToKey, addMonthsToKey, currentMonthKey, formatDateKey, formatMonth, monthKeyOf, monthsBetween } from "@/lib/dates";
import { routes } from "@/lib/routes";

/** "October 2026", or "Oct 2026 – Nov 2026" for several months. */
function monthRange(from: string, to: string): string {
  return from === to ? formatMonth(from) : `${formatMonth(from, "short")} – ${formatMonth(to, "short")}`;
}

const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/** What the new date does to the months billed (or, untracked, counted as paid direct). */
function changeNote(oldMonth: string, newMonth: string, rentTracked: boolean): { severity: "info" | "warning"; text: string } {
  if (newMonth === oldMonth) return { severity: "info", text: "Same month, so the months billed stay the same." };
  const earlier = newMonth < oldMonth;
  const [from, to] = earlier ? [addMonthsToKey(newMonth, 1), oldMonth] : [addMonthsToKey(oldMonth, 1), newMonth];
  const n = monthsBetween(from, addMonthsToKey(to, 1));
  const range = monthRange(from, to);
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
 * already recorded stay on their months.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.correctMoveOut(tenantId, { moveOutDate: date });
      setOpen(false);
      router.push(routes.tenants.detail(tenantId, { moveOutCorrected: "1" }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change this."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        aria-label="Correct move-out date"
        onClick={() => {
          setDate(movedOutOn);
          setError(null);
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Correct the move-out date</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              The last day in the house, now {formatDateKey(movedOutOn)}. Rent is billed up to and including its
              month, and the houses are free from the day after. Payments already recorded stay on the months they
              were applied to.
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
            {note ? <Alert severity={note.severity}>{note.text}</Alert> : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton variant="contained" onClick={save} disabled={!changed} loading={busy}>
            {busy ? "Saving…" : "Save"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { DateField } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { api, errorMessage } from "@/lib/api-client";
import { addDaysToKey, formatDateKey, formatMonth, monthKeyOf, monthsBetween, todayKey } from "@/lib/dates";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

/**
 * Fixes a moved-out tenant's move-out date (correct_move_out, 0037): their
 * houses end on it and rent is billed up to its month. Payments already
 * recorded stay on their months.
 */
export default function CorrectMoveOutButton({
  tenantId,
  movedOutOn,
  rentTracked,
}: {
  tenantId: string;
  movedOutOn: string;
  /** Untracked (Govt paid direct): no months to add or drop. */
  rentTracked: boolean;
}) {
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(movedOutOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oldMonth = monthKeyOf(movedOutOn);
  const newMonth = date ? monthKeyOf(date) : null;
  const removed = newMonth && newMonth < oldMonth ? monthsBetween(newMonth, oldMonth) : 0;
  const added = newMonth && newMonth > oldMonth ? monthsBetween(oldMonth, newMonth) : 0;
  // The usual mistake: the day they left instead of the end of the last month they paid for.
  const endOfMonthBefore = addDaysToKey(oldMonth, -1);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.correctMoveOut(tenantId, { moveOutDate: date });
      setOpen(false);
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
              The last day in the house. Rent is billed up to and including its month, and the houses are free from
              the day after. Payments already recorded stay on the months they were applied to.
            </Typography>
            <DateField
              label="Last day in the house"
              value={date}
              onChange={setDate}
              max={todayKey()}
              required
              fullWidth
              quickPicks={[{ label: formatDateKey(endOfMonthBefore), value: endOfMonthBefore }]}
            />
            {!date || date === movedOutOn ? null : !rentTracked || (!removed && !added) ? (
              <Alert severity="info">Moved out on {formatDateKey(date)}. The months billed stay the same.</Alert>
            ) : (
              <Alert severity={removed ? "warning" : "info"}>
                Billed up to {formatMonth(newMonth!)}
                {removed
                  ? `: ${removed} ${removed === 1 ? "month" : "months"} after it will be removed. Not possible if a payment is recorded for one of them.`
                  : `: ${added} more ${added === 1 ? "month" : "months"} will be owed.`}
              </Alert>
            )}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton variant="contained" onClick={save} disabled={!date || date === movedOutOn} loading={busy}>
            {busy ? "Saving…" : "Save"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

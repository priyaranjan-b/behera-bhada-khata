"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api, errorMessage } from "@/lib/api-client";
import { addMonthsToKey, formatMonth, monthKeyOf, monthsBetween, yearMonthOf } from "@/lib/dates";
import { billingStartFor } from "@/lib/domain/tenant";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

/**
 * Fixes "rent paid up to" for an active tenant (correct_paid_through, 0014):
 * billing then starts the month after. Payments already recorded stay on
 * their months.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newStart = paidThrough ? billingStartFor(leaseStart, monthKeyOf(paidThrough)) : null;
  const added = newStart && newStart < billingStart ? monthsBetween(newStart, billingStart) : 0;
  const removed = newStart && newStart > billingStart ? monthsBetween(billingStart, newStart) : 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.correctPaidThrough(tenantId, { paidThrough });
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
          setPaidThrough(current);
          setError(null);
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Correct &quot;rent paid up to&quot;</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              The last month this tenant paid before using the app. Billing starts the month after; payments already
              recorded stay on the months they were applied to.
            </Typography>
            <TextField
              label="Rent paid up to"
              type="month"
              value={paidThrough}
              onChange={(e) => setPaidThrough(e.target.value)}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {newStart && newStart !== billingStart ? (
              <Alert severity={removed ? "warning" : "info"}>
                Billing will start from {formatMonth(newStart)}
                {added
                  ? `: ${added} more ${added === 1 ? "month" : "months"} (${formatMonth(newStart)}${added > 1 ? ` – ${formatMonth(addMonthsToKey(billingStart, -1))}` : ""}) will be owed.`
                  : `: ${removed} ${removed === 1 ? "month" : "months"} before it will be removed. Not possible if a payment is recorded for one of them.`}
              </Alert>
            ) : newStart ? (
              <Typography variant="body2" color="textSecondary">
                No change: billing already starts in {formatMonth(billingStart)}.
              </Typography>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton
            variant="contained"
            onClick={save}
            disabled={!newStart || newStart === billingStart}
            loading={busy}
          >
            {busy ? "Saving…" : "Save"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

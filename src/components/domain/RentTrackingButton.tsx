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
import { addMonthsToKey, currentMonthKey, formatMonth, monthKeyOf, monthsBetween, yearMonthOf } from "@/lib/dates";
import { billingStartFor } from "@/lib/domain/tenant";
import { formatMoney } from "@/lib/money";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

/**
 * Turns rent tracking on for a government tenant whose rent goes to the
 * owner's bank directly (start_rent_tracking, 0016): billing starts the month
 * after "rent paid up to". `mode="stop"` undoes it while nothing is recorded.
 */
export default function RentTrackingButton(
  props:
    | { mode: "start"; tenantId: string; leaseStart: string; agreementRent: number }
    | { mode: "stop"; tenantId: string }
) {
  const router = useAppRouter();
  const lastMonth = yearMonthOf(addMonthsToKey(currentMonthKey(), -1));
  const [open, setOpen] = useState(false);
  const [paidThrough, setPaidThrough] = useState(lastMonth);
  const [rent, setRent] = useState(props.mode === "start" && props.agreementRent > 0 ? String(props.agreementRent) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = props.mode === "start";
  const billingStart = start && paidThrough ? billingStartFor(props.leaseStart, monthKeyOf(paidThrough)) : null;
  // Months already ended when tracking starts: they fall due at once.
  const endedMonths = billingStart ? monthsBetween(billingStart, currentMonthKey()) : 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (start) {
        await api.dashboard.tenants.startRentTracking(props.tenantId, {
          monthlyRentAmount: rent ? Number(rent) : undefined,
          paidThrough: paidThrough || undefined,
        });
      } else {
        await api.dashboard.tenants.stopRentTracking(props.tenantId);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change rent tracking."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        variant={start ? "contained" : "text"}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {start ? "Start tracking rent" : "Stop tracking"}
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{start ? "Start tracking rent" : "Stop tracking rent"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {start ? (
              <>
                <Typography variant="body2" color="textSecondary">
                  From now on this tenant is billed like any other: each month falls due, unpaid ended months show as
                  overdue and in Defaulters, and payments are recorded with Record payment.
                </Typography>
                <TextField
                  label="Monthly rent"
                  type="number"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  required
                  fullWidth
                  slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
                />
                <TextField
                  label="Rent paid up to"
                  type="month"
                  value={paidThrough}
                  onChange={(e) => setPaidThrough(e.target.value)}
                  helperText="The last month already received in your bank. Billing starts the month after."
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                {billingStart ? (
                  <Alert severity={endedMonths > 0 ? "warning" : "info"}>
                    Billing starts {formatMonth(billingStart)}.
                    {endedMonths > 0
                      ? ` ${endedMonths} ended ${endedMonths === 1 ? "month" : "months"}${Number(rent) > 0 ? ` (${formatMoney(endedMonths * Number(rent))})` : ""} will be overdue at once.`
                      : ""}
                  </Alert>
                ) : null}
              </>
            ) : (
              <Typography variant="body2" color="textSecondary">
                Their rent months are removed and the rent is treated as paid to you directly again. Possible only while
                no payment is recorded.
              </Typography>
            )}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton
            variant="contained"
            color={start ? "primary" : "error"}
            onClick={save}
            disabled={start && !rent}
            loading={busy}
          >
            {busy ? "Saving…" : start ? "Start tracking" : "Stop tracking"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { MonthField } from "@/components/ui";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
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
import RentSplitField from "./RentSplitField";
import { useRentSplit, type RentSplitHouse } from "./useRentSplit";

/**
 * Turns rent tracking on for a government tenant whose rent goes to the
 * owner's bank directly (start_rent_tracking, 0016): billing starts the month
 * after "rent paid up to". With several `houses`, asks how the rent splits
 * between them (D39). Stopping is StopRentTrackingButton (PIN-confirmed, 0039).
 */
export default function RentTrackingButton(props: {
  mode: "start";
  tenantId: string;
  leaseStart: string;
  agreementRent: number;
  houses: RentSplitHouse[];
}) {
  const router = useAppRouter();
  const lastMonth = yearMonthOf(addMonthsToKey(currentMonthKey(), -1));
  const [open, setOpen] = useState(false);
  const [paidThrough, setPaidThrough] = useState(lastMonth);
  const [rent, setRent] = useState(props.agreementRent > 0 ? String(props.agreementRent) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = useRentSplit(Number(rent) || 0, props.houses, true);
  const billingStart = paidThrough ? billingStartFor(props.leaseStart, monthKeyOf(paidThrough)) : null;
  // Months already ended when tracking starts: they fall due at once.
  const endedMonths = billingStart ? monthsBetween(billingStart, currentMonthKey()) : 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.startRentTracking(props.tenantId, {
        monthlyRentAmount: rent ? Number(rent) : undefined,
        paidThrough: paidThrough || undefined,
        houseRents: split.houseRents,
      });
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
        variant="contained"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Start tracking rent
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth={split.needed ? "sm" : "xs"}>
        <DialogTitle>Start tracking rent</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
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
            <RentSplitField split={split} disabled={busy} />
            <MonthField
              label="Rent paid up to"
              value={paidThrough}
              onChange={setPaidThrough}
              helperText="The last month already received in your bank. Billing starts the month after."
              fullWidth
            />
            {billingStart ? (
              <Alert severity={endedMonths > 0 ? "warning" : "info"}>
                Billing starts {formatMonth(billingStart)}.
                {endedMonths > 0
                  ? ` ${endedMonths} ended ${endedMonths === 1 ? "month" : "months"}${Number(rent) > 0 ? ` (${formatMoney(endedMonths * Number(rent))})` : ""} will be overdue at once.`
                  : ""}
              </Alert>
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
            disabled={!rent || Boolean(split.problem)}
            loading={busy}
          >
            {busy ? "Saving…" : "Start tracking"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

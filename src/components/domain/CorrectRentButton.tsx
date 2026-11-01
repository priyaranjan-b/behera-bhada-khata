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
import { formatMonth, monthKeyOf, yearMonthOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * Fixes a rent entered wrongly (correct_rent, 0025): every month from the one
 * chosen is re-priced, paid months included. A real rent change goes through
 * Edit tenant, where paid months keep their price.
 */
export default function CorrectRentButton({
  tenantId,
  billingStart,
  monthlyRent,
}: {
  tenantId: string;
  billingStart: string;
  monthlyRent: number;
}) {
  const router = useAppRouter();
  const firstMonth = yearMonthOf(billingStart);
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState(String(monthlyRent));
  const [fromMonth, setFromMonth] = useState(firstMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rentNumber = Number(rent) || 0;
  const ready = rentNumber > 0 && Boolean(fromMonth);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.correctRent(tenantId, { fromMonth, monthlyRent: rentNumber });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't correct the rent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        onClick={() => {
          setRent(String(monthlyRent));
          setFromMonth(firstMonth);
          setError(null);
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Correct the rent</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              For a rent entered wrongly: every month from the one you pick is re-priced, including months already
              paid. Payments stay as recorded. For a real rent increase, use Edit tenant instead.
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
            <MonthField
              label="Correct from"
              value={fromMonth}
              onChange={setFromMonth}
              min={firstMonth}
              helperText={`Billing starts ${formatMonth(billingStart)}`}
              required
              fullWidth
            />
            {ready ? (
              <Alert severity="info">
                Every rent month from {formatMonth(monthKeyOf(fromMonth))} on will be {formatMoney(rentNumber)}. Not
                possible if more than that is already counted for one of them.
              </Alert>
            ) : null}
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <LoadingButton variant="contained" onClick={save} disabled={!ready} loading={busy}>
            {busy ? "Saving…" : "Save"}
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

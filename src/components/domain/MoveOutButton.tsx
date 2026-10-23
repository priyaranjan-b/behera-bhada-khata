"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { api, errorMessage } from "@/lib/api-client";
import { todayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * Ends all of a tenant's houses on a date. Their ledger stays: dues up to the
 * move-out month remain to be collected, and the houses become free for the
 * next tenant from the following day.
 */
export default function MoveOutButton({
  tenantId,
  tenantName,
  unitCodes,
  outstanding,
}: {
  tenantId: string;
  tenantName: string;
  unitCodes: string[];
  outstanding: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.tenants.moveOut(tenantId, { moveOutDate: date });
      setOpen(false);
      router.push(`/dashboard/tenants/${tenantId}?movedOut=1`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't move this tenant out."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outlined" color="error" startIcon={<LogoutRoundedIcon />} onClick={() => setOpen(true)}>
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
                {formatMoney(outstanding)} is still owed. It stays on their ledger after they move out.
              </Alert>
            ) : null}
            <TextField
              label="Last day in the house"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={confirm} disabled={busy || !date}>
            {busy ? "Moving out…" : "Move out"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

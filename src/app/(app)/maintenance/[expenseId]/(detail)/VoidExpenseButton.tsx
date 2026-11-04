"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormActions } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { FLASH, routes } from "@/lib/routes";
import { MAINTENANCE_LIMITS } from "@/lib/validation";

/** Voids an expense (0031): it stays on record, struck from every total. Asks why. */
export default function VoidExpenseButton({ expenseId, description, amount }: { expenseId: string; description: string; amount: number }) {
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.maintenance.void(expenseId, { reason });
      router.replace(routes.maintenance.detail(expenseId, { [FLASH.maintenanceVoided]: "1" }));
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't void that expense."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outlined" color="error" onClick={() => setOpen(true)}>
        Void
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Void this expense?</DialogTitle>
        <DialogContent>
          <Stack component="form" onSubmit={submit} spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              {description} · {formatMoney(amount)}. It stays on record, marked voided, and no longer counts in any total.
              This can&apos;t be undone.
            </Typography>
            <TextField
              label="Why"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Entered twice"
              slotProps={{ htmlInput: { maxLength: MAINTENANCE_LIMITS.voidReasonMax } }}
              fullWidth
              autoFocus
            />
            <FormActions
              error={error}
              onCancel={() => setOpen(false)}
              submitLabel="Void expense"
              pendingLabel="Voiding…"
              pending={busy}
            />
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PaymentTagsField from "@/components/domain/PaymentTagsField";
import { FormActions } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { PaymentListRow } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * Adds or removes a payment's tags (0030, D34). Mount it with a `key` per
 * payment so it starts from that payment's tags. `onSaved` runs after the
 * write, to reload the table and learn any new names.
 */
export default function EditPaymentTagsDialog({
  payment,
  suggestions,
  onClose,
  onSaved,
}: {
  payment: Pick<PaymentListRow, "id" | "tenantName" | "amount" | "paymentDate" | "receiptNo" | "tags">;
  suggestions: string[];
  onClose: () => void;
  /** The payment's tags as saved. */
  onSaved: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(payment.tags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.dashboard.payments.setTags(payment.id, { tags });
      onSaved(saved.tags);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the tags."));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Payment tags</DialogTitle>
      <DialogContent>
        <Stack component="form" onSubmit={save} spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            {payment.tenantName} · {formatMoney(payment.amount)} on {formatDateKey(payment.paymentDate)}
            {payment.receiptNo ? ` · #${payment.receiptNo}` : ""}
          </Typography>
          <PaymentTagsField value={tags} onChange={setTags} suggestions={suggestions} disabled={busy} />
          <FormActions error={error} onCancel={onClose} submitLabel="Save" pendingLabel="Saving…" pending={busy} />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

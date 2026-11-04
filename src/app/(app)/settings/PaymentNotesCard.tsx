"use client";

import StickyNote2RoundedIcon from "@mui/icons-material/StickyNote2Rounded";
import ListSettingCard from "@/components/domain/ListSettingCard";
import { api } from "@/lib/api-client";
import type { PaymentNotePresetView } from "@/lib/contracts";
import { PAYMENT_NOTE_LIMITS } from "@/lib/validation";

const USED_IN = ["Record payment"];

/** The quick notes offered under "Note" when recording a payment (D30): add, rename or delete them. */
export default function PaymentNotesCard({ notes }: { notes: PaymentNotePresetView[] }) {
  return (
    <ListSettingCard
      title="Quick payment notes"
      caption="One tap under Note. Changing one never changes payments already saved."
      icon={<StickyNote2RoundedIcon />}
      tone="info"
      usedIn={USED_IN}
      noun="note"
      items={notes.map((n) => ({ id: n.id, text: n.text }))}
      maxItems={PAYMENT_NOTE_LIMITS.maxPresets}
      maxLength={PAYMENT_NOTE_LIMITS.maxLength}
      emptyTitle="No quick notes yet"
      emptyText="Add the notes you write most often, e.g. “Paid in cash to Bapi”."
      onCreate={(text) => api.dashboard.createPaymentNote({ text })}
      onRename={(id, text) => api.dashboard.updatePaymentNote(id, { text })}
      onDelete={(id) => api.dashboard.deletePaymentNote(id)}
    />
  );
}

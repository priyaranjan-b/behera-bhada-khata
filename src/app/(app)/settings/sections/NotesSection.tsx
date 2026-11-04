import type { PaymentNotePresetView } from "@/lib/contracts";
import PaymentNotesCard from "../PaymentNotesCard";

/** Settings: the quick payment notes list, streamed on its own call (A12). */
export default async function NotesSection({ notes }: { notes: Promise<PaymentNotePresetView[]> }) {
  return <PaymentNotesCard notes={await notes} />;
}

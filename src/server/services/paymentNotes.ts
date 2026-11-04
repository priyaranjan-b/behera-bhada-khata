import "server-only";
import type { PaymentNotePresetView } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { PAYMENT_NOTE_LIMITS, paymentNotePresetSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { notFound, parseInput, requireId, type OwnerContext } from "./context";

// Quick-select notes for the Record payment form (payment_note_presets,
// 0024), managed on the Settings page. A payment copies the note's text, so
// editing or deleting one here never changes a payment.

export async function listPaymentNotePresets(_ctx: OwnerContext): Promise<PaymentNotePresetView[]> {
  const db = await ownerDb();
  return (await db.paymentNotePresets.list()).map(({ id, text }) => ({ id, text }));
}

/** The notes' text, for the payment form. */
export async function paymentNoteSuggestions(db: OwnerRepositories): Promise<string[]> {
  return (await db.paymentNotePresets.list()).map((n) => n.text);
}

export async function createPaymentNotePreset(_ctx: OwnerContext, body: unknown): Promise<void> {
  const { text } = parseInput(paymentNotePresetSchema, body);
  const db = await ownerDb();
  const existing = await db.paymentNotePresets.list();
  if (existing.length >= PAYMENT_NOTE_LIMITS.maxPresets) {
    throw new ApiError(400, `Keep at most ${PAYMENT_NOTE_LIMITS.maxPresets} quick notes; delete one first`);
  }
  refuseDuplicate(existing, text);
  await db.paymentNotePresets.create(text);
}

export async function updatePaymentNotePreset(_ctx: OwnerContext, noteId: string, body: unknown): Promise<void> {
  requireId(noteId, "Note");
  const { text } = parseInput(paymentNotePresetSchema, body);
  const db = await ownerDb();
  refuseDuplicate(await db.paymentNotePresets.list(), text, noteId);
  if (!(await db.paymentNotePresets.update(noteId, text))) notFound("Note");
}

export async function deletePaymentNotePreset(_ctx: OwnerContext, noteId: string): Promise<void> {
  requireId(noteId, "Note");
  const db = await ownerDb();
  if (!(await db.paymentNotePresets.remove(noteId))) notFound("Note");
}

/** The unique index (any case) would refuse it too; this says which note. */
function refuseDuplicate(existing: { id: string; text: string }[], text: string, exceptId?: string) {
  const clash = existing.find((n) => n.id !== exceptId && n.text.toLowerCase() === text.toLowerCase());
  if (clash) throw new ApiError(409, `"${clash.text}" is already in the list`);
}

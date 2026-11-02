import "server-only";
import { asc, eq } from "drizzle-orm";
import type { OwnerProfile, PaymentNotePreset } from "@/lib/types";
import type { Tx } from "../client";
import { ownerProfile, paymentNotePresets } from "../schema";

// The owner's own settings (0013, 0024): plain reads and writes under RLS
// (is_app_owner()). updated_at is set by the tables' trigger; the profile's
// audit trigger records the change with the session's user id.

/** The one row, or null before the owner has saved a profile. */
export async function getOwnerProfile(tx: Tx): Promise<OwnerProfile | null> {
  const [row] = await tx.select().from(ownerProfile);
  return row ?? null;
}

type ProfileFields = Pick<OwnerProfile, "first_name" | "last_name" | "signature_name" | "signature_path">;

/** Creates or replaces the one row (PostgREST's upsert on the singleton). */
export async function saveOwnerProfile(tx: Tx, profile: ProfileFields): Promise<void> {
  await tx
    .insert(ownerProfile)
    .values({ singleton: true, ...profile })
    .onConflictDoUpdate({ target: ownerProfile.singleton, set: profile });
}

/** Alphabetical. */
export function listPaymentNotePresets(tx: Tx): Promise<PaymentNotePreset[]> {
  return tx.select().from(paymentNotePresets).orderBy(asc(paymentNotePresets.text));
}

/** A duplicate (any case, a unique index on lower(text)) is a 23505, so a 409. */
export async function createPaymentNotePreset(tx: Tx, text: string): Promise<void> {
  await tx.insert(paymentNotePresets).values({ text });
}

/** False if no such note. */
export async function updatePaymentNotePreset(tx: Tx, id: string, text: string): Promise<boolean> {
  const rows = await tx
    .update(paymentNotePresets)
    .set({ text })
    .where(eq(paymentNotePresets.id, id))
    .returning({ id: paymentNotePresets.id });
  return rows.length > 0;
}

/** False if no such note. */
export async function removePaymentNotePreset(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(paymentNotePresets)
    .where(eq(paymentNotePresets.id, id))
    .returning({ id: paymentNotePresets.id });
  return rows.length > 0;
}

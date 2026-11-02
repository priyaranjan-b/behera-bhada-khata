import "server-only";
import { asc } from "drizzle-orm";
import type { OwnerProfile, PaymentNotePreset } from "@/lib/types";
import type { Tx } from "../client";
import { ownerProfile, paymentNotePresets } from "../schema";

// Plain reads of the owner's own settings (0013, 0024).

/** The one row, or null before the owner has saved a profile. */
export async function getOwnerProfile(tx: Tx): Promise<OwnerProfile | null> {
  const [row] = await tx.select().from(ownerProfile);
  return row ?? null;
}

/** Alphabetical. */
export function listPaymentNotePresets(tx: Tx): Promise<PaymentNotePreset[]> {
  return tx.select().from(paymentNotePresets).orderBy(asc(paymentNotePresets.text));
}

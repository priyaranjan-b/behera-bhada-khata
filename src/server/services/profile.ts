import "server-only";
import { randomUUID } from "node:crypto";
import type { OwnerProfileView, SavedSignature } from "@/lib/contracts";
import { ownerFullName } from "@/lib/domain/owner";
import { ApiError } from "@/lib/errors";
import { changePasswordSchema, ownerProfileSchema } from "@/lib/validation";
import { auth, ownerDb, storage } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { recordEvent } from "./audit";
import { pngDataUrlToBytes } from "./confirmLinks";
import { parseInput, SIGNED_URL_SECONDS, type OwnerContext } from "./context";

// The owner's name and the signer's saved signature (owner_profile, 0013).
// The owner (e.g. a parent) can be someone other than the person who uses
// the login and signs receipts on their behalf; receipts print both.

export async function getOwnerProfile(ctx: OwnerContext): Promise<OwnerProfileView> {
  const db = await ownerDb();
  const profile = await db.ownerProfile.get();
  return {
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    signatureName: profile?.signature_name ?? null,
    email: ctx.email ?? null,
    displayName: ownerFullName(profile?.first_name, profile?.last_name),
    signatureUrl: profile?.signature_path ? await storage.signedUrl(profile.signature_path, SIGNED_URL_SECONDS) : null,
  };
}

/** Saves the names; a new signature replaces the saved one, whose file is then deleted. */
export async function updateOwnerProfile(ctx: OwnerContext, body: unknown): Promise<void> {
  const input = parseInput(ownerProfileSchema, body);
  const db = await ownerDb();
  const current = await db.ownerProfile.get();
  const oldPath = current?.signature_path ?? null;

  let signaturePath = input.removeSignature ? null : oldPath;
  let uploaded: string | null = null;
  if (input.signaturePng) {
    const bytes = pngDataUrlToBytes(input.signaturePng);
    uploaded = `owner/signature-${randomUUID()}.png`;
    try {
      await storage.upload(uploaded, bytes, "image/png");
    } catch (err) {
      console.error(err);
      throw new ApiError(500, "Could not save the signature");
    }
    signaturePath = uploaded;
  }

  try {
    await db.ownerProfile.save({
      first_name: input.firstName,
      last_name: input.lastName,
      signature_name: input.signatureName,
      signature_path: signaturePath,
    });
  } catch (err) {
    if (uploaded) await storage.remove([uploaded]);
    throw err;
  }
  // Every record keeps its own copy of the signature, so the old file isn't on any receipt.
  if (oldPath && oldPath !== signaturePath) await storage.remove([oldPath]);
}

/** Sets the signed-in owner's password, for signing in without an email link. */
export async function changePassword(_ctx: OwnerContext, body: unknown): Promise<void> {
  const { password } = parseInput(changePasswordSchema, body);
  await auth.updatePassword(password);
  await recordEvent(await ownerDb(), { action: "auth.password_changed" });
}

/** For the payment/adjustment forms: the saved signature to offer instead of drawing. */
export async function savedSignatureFor(db: OwnerRepositories, ctx: OwnerContext): Promise<SavedSignature | null> {
  const profile = await db.ownerProfile.get();
  if (!profile?.signature_path) return null;
  return {
    url: await storage.signedUrl(profile.signature_path, SIGNED_URL_SECONDS),
    signerName: profile.signature_name ?? ownerFullName(profile.first_name, profile.last_name) ?? ctx.email ?? "Owner",
  };
}

/** The signature for a new record: the one drawn with it, else the saved one. */
export async function ownerSignatureBytes(db: OwnerRepositories, drawnPng: string | undefined): Promise<Uint8Array> {
  if (drawnPng) return pngDataUrlToBytes(drawnPng);
  const profile = await db.ownerProfile.get();
  if (!profile?.signature_path) throw new ApiError(400, "Sign it, or save your signature on the Profile page");
  try {
    return await storage.download(profile.signature_path);
  } catch (err) {
    console.error(err);
    throw new ApiError(500, "Could not load your saved signature");
  }
}

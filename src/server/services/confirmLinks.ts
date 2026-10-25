import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/errors";
import type { RecordType, Tenant } from "@/lib/types";
import { messaging, storage } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { env, tenantMessagingEnabled } from "@/server/env";
import { generateConfirmToken } from "@/server/token";
import { recordEvent } from "./audit";

// Shared by payments and adjustments: both are recorded "pending" with the
// owner's signature and a hashed one-time token, then the tenant is sent a
// link to /confirm/[token].

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decodes a `data:image/png;base64,...` URL; 400 unless the bytes really are a PNG. */
export function pngDataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length < PNG_MAGIC.length + 16 || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new ApiError(400, "Signature must be a PNG image");
  }
  return bytes;
}

/** Storage folder for one ledger record: per tenant, since billing is per tenant. */
export function recordFolder(kind: "payments" | "adjustments", tenantId: string, recordId: string): string {
  return `${kind}/${tenantId}/${recordId}`;
}

/** New record id + owner signature (drawn, or the saved one) uploaded under it. */
export async function storeOwnerSignature(
  kind: "payments" | "adjustments",
  tenant: Pick<Tenant, "id">,
  bytes: Uint8Array
): Promise<{ id: string; ownerSignaturePath: string }> {
  const id = randomUUID();
  const ownerSignaturePath = `${recordFolder(kind, tenant.id, id)}/owner-signature.png`;
  try {
    await storage.upload(ownerSignaturePath, bytes, "image/png");
  } catch (err) {
    console.error(err);
    throw new ApiError(500, "Could not save signature");
  }
  return { id, ownerSignaturePath };
}

/**
 * Runs the ledger write that goes with already-uploaded files (the signature,
 * any proofs); if it fails, removes them so rejected requests don't leave
 * orphans behind.
 */
export async function withUploadedFile<T>(paths: string | string[], write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    await storage.remove(typeof paths === "string" ? [paths] : paths);
    throw err;
  }
}

export function confirmUrl(token: string): string {
  return `${env().NEXT_PUBLIC_APP_URL}/confirm/${token}`;
}

/** The record a message is about, for the audit log (never the message text). */
export interface NotifyAbout {
  db: Pick<OwnerRepositories, "audit">;
  recordType: RecordType;
  recordId: string;
  receiptNo?: string;
}

/**
 * Sends the tenant a message on their preferred channel(s); false if no
 * channel accepted it. Every attempt is logged, delivered or not.
 */
export async function notifyTenant(
  tenant: Pick<Tenant, "id" | "phone" | "preferred_channel">,
  message: string,
  about: NotifyAbout
): Promise<boolean> {
  const delivered = await send(tenant, message);
  await recordEvent(about.db, {
    action: "message.sent",
    tenantId: tenant.id,
    entityType: about.recordType,
    entityId: about.recordId,
    context: { channel: tenant.preferred_channel, delivered, receiptNo: about.receiptNo ?? null },
  });
  return delivered;
}

async function send(tenant: Pick<Tenant, "phone" | "preferred_channel">, message: string): Promise<boolean> {
  // A draft tenant may not have a phone yet; without Twilio nobody can be messaged.
  if (!tenant.phone || !tenantMessagingEnabled()) return false;
  try {
    const { delivered } = await messaging.send({ toPhoneE164: tenant.phone, channel: tenant.preferred_channel, message });
    return delivered;
  } catch (err) {
    console.error("notifyTenant:", err);
    return false;
  }
}

export { generateConfirmToken };

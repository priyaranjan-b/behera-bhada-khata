import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/errors";
import type { Tenant } from "@/lib/types";
import { storage } from "@/server/infra";
import { sendConfirmLink } from "@/server/messaging/twilio";
import { generateConfirmToken } from "@/server/token";

// Shared by payments and adjustments: both are recorded "pending" with the
// owner's signature and a hashed one-time token, then the tenant is sent a
// link to /confirm/[token].

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** New record id + owner signature uploaded under it. */
export async function storeOwnerSignature(
  kind: "payments" | "adjustments",
  tenant: Pick<Tenant, "id" | "property_id">,
  signaturePng: string
): Promise<{ id: string; ownerSignaturePath: string }> {
  const id = randomUUID();
  const ownerSignaturePath = `${kind}/${tenant.property_id}/${tenant.id}/${id}/owner-signature.png`;
  try {
    await storage.upload(ownerSignaturePath, dataUrlToBytes(signaturePng), "image/png");
  } catch {
    throw new ApiError(500, "Could not save signature");
  }
  return { id, ownerSignaturePath };
}

export function confirmUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/confirm/${token}`;
}

export async function notifyTenant(
  tenant: Pick<Tenant, "phone" | "preferred_channel">,
  message: string
): Promise<void> {
  await sendConfirmLink({ toPhoneE164: tenant.phone, channel: tenant.preferred_channel, message });
}

export { generateConfirmToken };

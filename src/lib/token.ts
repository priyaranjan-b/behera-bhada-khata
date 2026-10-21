import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const CONFIRM_LINK_TTL_DAYS = 14;

// The plaintext token only ever exists in the WhatsApp/SMS message and the
// tenant's browser URL - we store just its hash, the same way a password
// reset token would be handled, so a DB leak alone can't forge a confirmation.
export function generateConfirmToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CONFIRM_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { token, tokenHash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

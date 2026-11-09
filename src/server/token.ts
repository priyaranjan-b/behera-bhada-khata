import "server-only";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

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

/**
 * A keyed hash for a value that must not be recoverable from what is stored:
 * a phone number or an IP in a rate-limit key or the audit log. A plain
 * sha256 of a 10-digit mobile can be brute-forced; this needs the server's
 * secret key too. Rotating the key only resets rate-limit windows.
 */
export function keyedHash(value: string): string {
  return createHmac("sha256", env().SUPABASE_SECRET_KEY).update(value).digest("hex");
}

/** Constant-time comparison of two secrets (e.g. a bearer token against the configured one). */
export function secretsEqual(provided: string, expected: string): boolean {
  // Hash both so the comparison is fixed-length and leaks nothing about length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

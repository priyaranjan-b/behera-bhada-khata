import "server-only";
import { otp, systemDb } from "@/server/infra";
import { keyedHash } from "@/server/token";
import { MINUTE } from "./context";

// Sending and checking an SMS code (A34), whichever provider sends it: the
// tenant sign-in (./tenantAuth) and acknowledging a payment (./confirm).
// A provider that checks against its own reference (2Factor's session id)
// gets it back from otp_sessions (0035), keyed by a keyed hash of the phone,
// so it survives between the two requests and across server instances.

/** How long a code's reference is kept: longer than any provider keeps the code itself. */
const REFERENCE_MINUTES = 15;

const sessionKey = (phoneE164: string) => keyedHash(`otp:${phoneE164}`);

/** Sends a code to `phoneE164` and keeps the provider's reference, if it gives one. */
export async function sendCode(phoneE164: string): Promise<void> {
  const reference = await otp.sendOtp(phoneE164);
  if (!reference) return;
  const expiresAt = new Date(Date.now() + REFERENCE_MINUTES * MINUTE * 1000).toISOString();
  await systemDb().otpSessions.save(sessionKey(phoneE164), reference, expiresAt);
}

/** Whether `code` is the latest code sent to `phoneE164`. A match uses it up. Throws only if the provider fails. */
export async function codeMatches(phoneE164: string, code: string): Promise<boolean> {
  const db = systemDb();
  const key = sessionKey(phoneE164);
  const reference = await db.otpSessions.get(key);
  const ok = await otp.checkOtp(phoneE164, code, reference);
  if (ok && reference) await db.otpSessions.remove(key);
  return ok;
}

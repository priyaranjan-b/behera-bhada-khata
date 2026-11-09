import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Tx } from "../client";
import { otpSessions } from "../schema";

// An SMS code's provider reference between sending and checking it (0035,
// D38): service role only, keyed by a keyed hash of the phone.

/** Saves (or replaces: a new code supersedes the last) the reference for `key`. */
export async function saveOtpSession(tx: Tx, key: string, reference: string, expiresAt: string): Promise<void> {
  await tx
    .insert(otpSessions)
    .values({ key, reference, expires_at: expiresAt })
    .onConflictDoUpdate({
      target: otpSessions.key,
      set: { reference, expires_at: expiresAt, created_at: sql`now()` },
    });
}

/** The reference for `key`, if it hasn't expired (on the database clock). */
export async function getOtpSession(tx: Tx, key: string): Promise<string | null> {
  const [row] = await tx
    .select({ reference: otpSessions.reference })
    .from(otpSessions)
    .where(and(eq(otpSessions.key, key), gt(otpSessions.expires_at, sql`now()`)));
  return row?.reference ?? null;
}

export async function removeOtpSession(tx: Tx, key: string): Promise<void> {
  await tx.delete(otpSessions).where(eq(otpSessions.key, key));
}

/** Drops expired references; returns how many. */
export async function pruneOtpSessions(tx: Tx): Promise<number> {
  const rows = await tx
    .delete(otpSessions)
    .where(sql`${otpSessions.expires_at} < now()`)
    .returning({ key: otpSessions.key });
  return rows.length;
}

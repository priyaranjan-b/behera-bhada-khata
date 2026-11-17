import "server-only";
import { sql } from "drizzle-orm";
import type { CorrectionAction } from "@/lib/types";
import type { CorrectionPinStatusDb, CorrectionResult } from "@/server/ports";
import { executeRows, type Tx } from "../client";

// The corrections PIN (0039, D41): set, status and check stay in Postgres,
// which holds the salted hash, counts wrong PINs and leaves the one-time
// ticket the gated functions use up. Timestamps come back as ISO strings.

const iso = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

type Refusal = { ok: boolean; tries_left: number | null; locked_until: string | null };

const refusal = (row: Refusal): CorrectionResult<never> => ({
  ok: false,
  triesLeft: row.tries_left,
  lockedUntil: row.locked_until,
});

export async function correctionPinStatus(tx: Tx): Promise<CorrectionPinStatusDb> {
  const [row] = await executeRows<{
    pin_set: boolean;
    pin_set_at: string | null;
    locked_until: string | null;
    setup_until: string | null;
  }>(
    tx,
    sql`select pin_set, ${iso("pin_set_at")} as pin_set_at, ${iso("locked_until")} as locked_until,
          ${iso("setup_until")} as setup_until
        from correction_pin_status()`
  );
  return { pinSet: row.pin_set, pinSetAt: row.pin_set_at, lockedUntil: row.locked_until, setupUntil: row.setup_until };
}

export async function setCorrectionPin(tx: Tx, pin: string, currentPin: string | null): Promise<CorrectionResult<void>> {
  const [row] = await executeRows<Refusal>(
    tx,
    sql`select ok, tries_left, ${iso("locked_until")} as locked_until
        from set_correction_pin(p_new => ${pin}::text, p_old => ${currentPin}::text)`
  );
  return row.ok ? { ok: true, value: undefined } : refusal(row);
}

/**
 * Checks the PIN and, if it's right, runs `write` in the same transaction:
 * the ticket verify_correction_pin leaves is used up by the gated function
 * `write` calls, and nobody else ever sees it. A wrong PIN returns without
 * writing, so the transaction commits the failure count.
 */
export async function withCorrectionPin<T>(
  tx: Tx,
  pin: string,
  action: CorrectionAction,
  targetId: string,
  write: () => Promise<T>
): Promise<CorrectionResult<T>> {
  const [row] = await executeRows<Refusal>(
    tx,
    sql`select ok, tries_left, ${iso("locked_until")} as locked_until
        from verify_correction_pin(p_pin => ${pin}::text, p_action => ${action}::text, p_target => ${targetId}::uuid)`
  );
  if (!row.ok) return refusal(row);
  return { ok: true, value: await write() };
}

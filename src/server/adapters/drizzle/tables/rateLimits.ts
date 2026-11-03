import "server-only";
import { sql } from "drizzle-orm";
import { executeRows, type Tx } from "../client";

// Replaces hit_rate_limit() and prune_rate_limits() (0004, D12; dropped in
// 0029, D33) for valid
// limits: fixed-window counters in rate_limits, which only service_role may
// touch (RLS on, no policies). Each is one atomic statement, so concurrent
// hits never lose a count. Windows are cut on the database's clock, the one
// clock every app instance shares.

/** How long a finished window is kept: a day, as the dropped prune_rate_limits() (0004) kept it. */
const KEEP = sql`interval '1 day'`;

/**
 * Refuses a nonsense limit before any database work. A caller bug, not user
 * input: the limits are constants (RATE_LIMITS in src/server/services/context.ts).
 */
export function checkRateLimit(limit: number, windowSeconds: number): void {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0 || !Number.isInteger(limit) || limit < 0) {
    throw new Error(`bad rate limit ${limit}/${windowSeconds}s`);
  }
}

/** Records one hit for `key`; false once it is over `limit` hits in the current `windowSeconds` window. */
export async function hitRateLimit(tx: Tx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await executeRows<{ count: number }>(
    tx,
    sql`insert into rate_limits (key, window_start, count)
        values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}::int) * ${windowSeconds}::int), 1)
        on conflict (key, window_start) do update set count = rate_limits.count + 1
        returning count`
  );
  return row.count <= limit;
}

/** Drops windows that ended more than a day ago; returns how many. */
export async function pruneRateLimits(tx: Tx): Promise<number> {
  const [row] = await executeRows<{ n: number }>(
    tx,
    sql`with deleted as (delete from rate_limits where window_start < now() - ${KEEP} returning 1)
        select count(*)::int as n from deleted`
  );
  return row.n;
}

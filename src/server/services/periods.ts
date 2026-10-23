import "server-only";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { systemDb } from "@/server/infra";

const LOOKAHEAD_MONTHS = 2;

function throughMonth(): string {
  return addMonthsToKey(currentMonthKey(), LOOKAHEAD_MONTHS);
}

// Creates any rent_periods between each tenant's lease start and
// LOOKAHEAD_MONTHS from now that don't already exist, so a tenant who is
// months behind (or who the owner hasn't logged a payment for yet) always
// shows up as overdue rather than simply missing. One set-based statement
// however many tenants, and a no-op once the periods exist - cheap enough to
// run before the reads that depend on it (the daily cron does the rest).
// Callers pass ids they already got from an owner-scoped query.
export async function ensureRentPeriodsFor(tenantIds: string[]): Promise<void> {
  if (tenantIds.length === 0) return;
  await systemDb().rentPeriods.ensure(tenantIds, throughMonth());
}

/** Cron: top up periods for every active tenant and drop expired rate-limit counters. */
export async function runDailyUpkeep(): Promise<{ periodsCreated: number; rateLimitsPruned: number }> {
  const db = systemDb();
  const periodsCreated = await db.rentPeriods.ensure(null, throughMonth());
  const rateLimitsPruned = await db.rateLimits.prune();
  return { periodsCreated, rateLimitsPruned };
}

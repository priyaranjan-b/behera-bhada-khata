import "server-only";
import { addMonths, format, startOfMonth } from "date-fns";
import { systemDb } from "@/server/infra";

const LOOKAHEAD_MONTHS = 2;

export function monthKey(d: Date): string {
  return format(startOfMonth(d), "yyyy-MM-dd");
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}

// Creates any rent_periods between the tenant's lease start and
// LOOKAHEAD_MONTHS from now that don't already exist, so a tenant who is
// months behind (or who the owner hasn't logged a payment for yet) always
// shows up as overdue rather than simply missing.
export async function ensureRentPeriods(tenantId: string): Promise<void> {
  const db = systemDb();
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) return;

  const start = startOfMonth(new Date(`${tenant.lease_start}T00:00:00Z`));
  const end = addMonths(startOfMonth(new Date()), LOOKAHEAD_MONTHS);

  const months: string[] = [];
  for (let d = start; d <= end; d = addMonths(d, 1)) {
    months.push(monthKey(d));
  }
  if (months.length === 0) return;

  const existing = new Set((await db.rentPeriods.listForTenant(tenantId)).map((r) => r.period_month));
  await db.rentPeriods.insertMany(
    months
      .filter((m) => !existing.has(m))
      .map((period_month) => ({ tenant_id: tenantId, period_month, amount_due: tenant.monthly_rent_amount }))
  );
}

export async function ensureRentPeriodsFor(tenantIds: string[]): Promise<void> {
  await Promise.all(tenantIds.map(ensureRentPeriods));
}

/** Cron: top up periods for every active tenant. */
export async function ensureAllActiveTenantPeriods(): Promise<{ tenantsProcessed: number }> {
  const ids = await systemDb().tenants.listActiveIds();
  // Every owner's tenants at once, so one at a time rather than all in parallel.
  for (const id of ids) await ensureRentPeriods(id);
  return { tenantsProcessed: ids.length };
}

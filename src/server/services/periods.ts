import "server-only";
import { billedThroughMonth, paidDirectId, paidDirectMonths } from "@/lib/domain/billing";
import { isRentTracked } from "@/lib/domain/tenant";
import type { RentPeriod, Tenant, TenantRentRate } from "@/lib/types";
import { systemDb } from "@/server/infra";

// Creates any rent_periods between each tenant's lease start and
// RENT_LOOKAHEAD_MONTHS from now that don't already exist, so a tenant who is
// months behind (or who the owner hasn't logged a payment for yet) always
// shows up as overdue rather than simply missing. One set-based statement
// however many tenants, and a no-op once the periods exist - cheap enough to
// run before the reads that depend on it (the daily cron does the rest).
// Callers pass ids they already got from an owner-scoped query.
export async function ensureRentPeriodsFor(tenantIds: string[]): Promise<void> {
  if (tenantIds.length === 0) return;
  await systemDb().rentPeriods.ensure(tenantIds, billedThroughMonth());
}

/** Rent months by tenant id. */
export function groupPeriods(periods: RentPeriod[]): Map<string, RentPeriod[]> {
  const byTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    const list = byTenant.get(period.tenant_id) ?? [];
    list.push(period);
    byTenant.set(period.tenant_id, list);
  }
  return byTenant;
}

/** The tenants the app bills (active, rent tracked - 0016), for ensureRentPeriodsFor. */
export function billedTenantIds(tenants: Tenant[]): string[] {
  return tenants.filter((t) => isRentTracked({ status: t.status, rentTracked: t.rent_tracked })).map((t) => t.id);
}

/** Government tenants whose rent is paid to the owner directly (untracked, 0016), current or former. */
export function paidDirectTenants(tenants: Tenant[]): Tenant[] {
  return tenants.filter((t) => !t.rent_tracked && t.status !== "draft");
}

/**
 * Their agreement rent for `months`, as rent months already paid in full -
 * computed here, never stored (see paidDirectMonths). Ids are paidDirectId(),
 * so nothing will look them up in the ledger.
 */
export function paidDirectPeriods(
  tenants: Tenant[],
  ratesByTenant: Map<string, TenantRentRate[]>,
  months: string[]
): RentPeriod[] {
  const horizon = billedThroughMonth();
  return paidDirectTenants(tenants).flatMap((t) =>
    paidDirectMonths(
      { leaseStart: t.lease_start, movedOutOn: t.moved_out_on },
      ratesByTenant.get(t.id) ?? [],
      months,
      horizon
    ).map(({ month, amount }) => ({
      id: paidDirectId(t.id, month),
      tenant_id: t.id,
      period_month: month,
      amount_due: amount,
      amount_allocated: amount,
      status: "paid" as const,
      created_at: "",
    }))
  );
}

/** Cron: top up periods for every active tenant, drop expired rate-limit counters, old tenant portal sessions (A32) and expired code references (A34). */
export async function runDailyUpkeep(): Promise<{
  periodsCreated: number;
  rateLimitsPruned: number;
  tenantSessionsPruned: number;
  otpSessionsPruned: number;
}> {
  const db = systemDb();
  const periodsCreated = await db.rentPeriods.ensure(null, billedThroughMonth());
  const rateLimitsPruned = await db.rateLimits.prune();
  const tenantSessionsPruned = await db.tenantSessions.prune();
  const otpSessionsPruned = await db.otpSessions.prune();
  return { periodsCreated, rateLimitsPruned, tenantSessionsPruned, otpSessionsPruned };
}

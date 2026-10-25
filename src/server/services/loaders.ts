import "server-only";
import { cache } from "react";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import type { RentPeriod, Tenant } from "@/lib/types";
import { ownerDb } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { billedTenantIds, ensureRentPeriodsFor } from "./periods";
import { loadPlacements, type Placements } from "./placements";

// Reads that several screens or sections need, wrapped in React `cache()`
// (A12): within one page render every caller gets the same promise, so the
// tenant list, the `ensure_rent_periods` write and the rent months run once
// however many sections ask. Outside a render (a route handler, a test)
// `cache` is a plain call. Callers read this data only through these, never
// with their own `db.*` call for the same rows.

/** Months the recent window covers: the Overview's trend, and the payments and rent months it needs. */
export const RECENT_MONTHS = 6;

/** The last RECENT_MONTHS month keys, ending this month. */
export function recentMonthKeys(): string[] {
  const today = currentMonthKey();
  return Array.from({ length: RECENT_MONTHS }, (_, i) => addMonthsToKey(today, i - (RECENT_MONTHS - 1)));
}

/** The owner's repositories, once per request. */
export const db = cache((): Promise<OwnerRepositories> => ownerDb());

/** Every tenant (drafts and moved-out ones included). */
export const tenantsList = cache(async (): Promise<Tenant[]> => (await db()).tenants.list());

/** Every tenant, after topping up the rent months of the billed ones - wait for this before reading rent months. */
export const billedTenants = cache(async (): Promise<Tenant[]> => {
  const tenants = await tenantsList();
  await ensureRentPeriodsFor(billedTenantIds(tenants));
  return tenants;
});

/** Every tenant's houses and rent history. */
export const placements = cache(
  async (): Promise<Placements> => loadPlacements(await db(), (await tenantsList()).map((t) => t.id))
);

/** Every unpaid rent month (for balances and arrears), plus every month from `fromMonth`. */
export const periodsFrom = cache(async (fromMonth: string): Promise<RentPeriod[]> => {
  const [tenants, repos] = await Promise.all([billedTenants(), db()]);
  return repos.rentPeriods.listForTenants(
    tenants.map((t) => t.id),
    { openOrFrom: fromMonth }
  );
});

/** Unpaid rent months plus the recent window: what the Overview's sections and Defaulters share. */
export const recentPeriods = (): Promise<RentPeriod[]> => periodsFrom(recentMonthKeys()[0]);

/** Confirmed payments dated in the recent window. */
export const recentPayments = cache(async () => {
  const [tenants, repos] = await Promise.all([tenantsList(), db()]);
  return repos.payments.listForTenants(
    tenants.map((t) => t.id),
    { status: "confirmed", fromDate: recentMonthKeys()[0] }
  );
});

/** Confirmed adjustments dated in the recent window. */
export const recentAdjustments = cache(async () => {
  const [tenants, repos] = await Promise.all([tenantsList(), db()]);
  return repos.adjustments.listForTenants(
    tenants.map((t) => t.id),
    { status: "confirmed", fromDate: recentMonthKeys()[0] }
  );
});

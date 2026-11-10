// Pure and client-safe: the Houses page's "Show" filter, and how a rent is
// split over houses (maintenance shares, house rents, D39). Shared by the
// server and the client forms, so it can't live in a "use client" file.

import { formatMoney, round2 } from "@/lib/money";

export type HouseFilter = "all" | "vacant" | "occupied" | "retired";

export const HOUSE_FILTERS: { value: HouseFilter; label: string }[] = [
  { value: "all", label: "All houses" },
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "retired", label: "Retired" },
];

/** `?show=` from the URL; anything unknown shows every house. */
export function parseHouseFilter(value: string | null | undefined): HouseFilter {
  return HOUSE_FILTERS.find((f) => f.value === value)?.value ?? "all";
}

/** Vacant = in use with nobody in it today; the dashboard's "Vacant houses" card counts the same. */
export function isVacant(house: { isActive: boolean; occupied: boolean }): boolean {
  return house.isActive && !house.occupied;
}

export function matchesHouseFilter(house: { isActive: boolean; occupied: boolean }, filter: HouseFilter): boolean {
  switch (filter) {
    case "vacant":
      return isVacant(house);
    case "occupied":
      return house.occupied;
    case "retired":
      return !house.isActive;
    default:
      return true;
  }
}

/** One house's part of an amount (a maintenance expense, a tenant's rent). */
export interface HouseShare {
  unitCode: string;
  share: number;
}

/**
 * The amount split equally over the houses, as maintenance_shares() in 0031
 * does it: everyone gets the same whole paise, and the paise left over go
 * one each to the first houses by code, so the shares add up to the amount.
 * Duplicates count once; the result is in code order.
 */
export function splitEqually(amount: number, unitCodes: readonly string[]): HouseShare[] {
  const codes = [...new Set(unitCodes)].sort();
  if (codes.length === 0 || !Number.isFinite(amount) || amount <= 0) return codes.map((unitCode) => ({ unitCode, share: 0 }));
  const paise = Math.round(amount * 100);
  const base = Math.floor(paise / codes.length);
  const extra = paise - base * codes.length;
  return codes.map((unitCode, i) => ({ unitCode, share: (base + (i < extra ? 1 : 0)) / 100 }));
}

/** The houses' rents added up, in whole paise so 0.1 + 0.2 is 0.3; houses with no rent count 0. */
export function totalRent(rents: readonly (number | null | undefined)[]): number {
  return round2(rents.reduce<number>((sum, r) => sum + Math.round((r ?? 0) * 100), 0) / 100);
}

/**
 * Where to start splitting a tenant's rent over their houses. When every
 * house has a rent, in proportion to those rents (unchanged when they
 * already add up; a shop at 8,000 and a flat at 4,000 stay two to one),
 * whole paise, the paise left over one each to the first houses by code.
 * Otherwise an equal split. In code order.
 */
export function defaultRentSplit(
  rent: number,
  houses: readonly { unitCode: string; baseRent: number | null }[]
): HouseShare[] {
  const sorted = [...houses].sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  const codes = sorted.map((h) => h.unitCode);
  const paise = Math.round(rent * 100);
  const weights = sorted.map((h) => Math.round((h.baseRent ?? 0) * 100));
  const weight = weights.reduce((a, b) => a + b, 0);
  if (paise <= 0 || weights.some((w) => w <= 0)) return splitEqually(rent, codes);
  const shares = weights.map((w) => Math.floor((paise * w) / weight));
  let left = paise - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % shares.length, left--) shares[i] += 1;
  return codes.map((unitCode, i) => ({ unitCode, share: shares[i] / 100 }));
}

/**
 * The houses a tenant's rent is split over (D39): their houses now, none
 * once they've moved out (their old houses may be let again). The form and
 * the service both ask this, so they agree on when a split is needed.
 */
export function rentSplitHouses<H>(tenant: { status: string }, houses: readonly H[]): H[] {
  return tenant.status === "inactive" ? [] : [...houses];
}

/**
 * A let house's tenant against their houses' rents (D39): how much the
 * houses' rents are above (+) or below (-) the tenant's rent, or null when
 * they agree or the tenant has no rent on file (an untracked government
 * tenant), which is nothing to warn about.
 */
export function tenantRentGap(tenant: { monthlyRent: number; housesRent: number }): number | null {
  if (!(tenant.monthlyRent > 0)) return null;
  const gap = round2(tenant.housesRent - tenant.monthlyRent);
  return gap === 0 ? null : gap;
}

/** The tenant's houses' rents with one house's rent changed from `before` to `after` (null = none). */
export function housesRentWith(housesRent: number, before: number | null, after: number | null): number {
  return totalRent([housesRent, -(before ?? 0), after ?? 0]);
}

/**
 * Why a split of `rent` over `unitCodes` can't be saved, or null if it can
 * (D39): one share per house, each above zero, adding up to the rent
 * exactly. The form shows the message; the service refuses with it.
 */
export function rentSplitProblem(
  rent: number,
  unitCodes: readonly string[],
  split: readonly HouseShare[]
): string | null {
  const codes = new Set(unitCodes);
  const given = new Set(split.map((s) => s.unitCode));
  if (given.size !== split.length || given.size !== codes.size || [...codes].some((c) => !given.has(c))) {
    return "Give each of the tenant's houses its part of the rent.";
  }
  if (split.some((s) => !(s.share > 0))) return "Each house's rent must be more than zero.";
  const diff = round2(totalRent(split.map((s) => s.share)) - rent);
  if (diff < 0) return `The houses' rents add up to ${formatMoney(-diff)} less than the rent.`;
  if (diff > 0) return `The houses' rents add up to ${formatMoney(diff)} more than the rent.`;
  return null;
}

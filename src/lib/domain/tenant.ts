import { addMonthsToKey, monthKeyOf } from "@/lib/dates";
import type { UnitType } from "@/lib/types";

export interface TenantDisplayLike {
  name: string;
  business_name?: string | null;
}

// Commercial tenants are usually looked for by their business/shop name;
// the personal contact name becomes secondary.
export function tenantDisplayName(tenant: TenantDisplayLike): string {
  return tenant.business_name || tenant.name;
}

/** What a tenant rents, across all their houses. */
export type UnitMix = UnitType | "mixed";

export function unitMix(types: UnitType[]): UnitMix | null {
  if (types.length === 0) return null;
  return types.every((t) => t === types[0]) ? types[0] : "mixed";
}

export function unitMixLabel(mix: UnitMix | null): string {
  if (mix === "commercial") return "Commercial";
  if (mix === "residential") return "Residential";
  if (mix === "mixed") return "Residential + commercial";
  return "No house";
}

/**
 * Compact list of house codes, sharing the tower prefix where possible:
 * ["AC-T1-G01", "AC-T1-G02", "AC-T2-101"] -> "AC-T1-G01, G02 · AC-T2-101".
 */
export function formatUnits(unitCodes: string[]): string {
  const byTower = new Map<string, string[]>();
  for (const code of [...unitCodes].sort()) {
    const tower = code.slice(0, code.lastIndexOf("-"));
    const house = code.slice(code.lastIndexOf("-") + 1);
    byTower.set(tower, [...(byTower.get(tower) ?? []), house]);
  }
  return [...byTower.entries()].map(([tower, houses]) => `${tower}-${houses.join(", ")}`).join(" · ");
}

/** "Ground floor", "Floor 1", or "" when the register has no floor. */
export function formatFloor(floor: string | null): string {
  if (!floor) return "";
  if (floor === "G") return "Ground floor";
  if (floor.startsWith("B")) return floor === "B" ? "Basement" : `Basement ${floor.slice(1)}`;
  return `Floor ${floor}`;
}

/**
 * First billed month: the month after "rent paid up to" (a month key), never
 * before the lease month. Same rule as billing_start_for() in 0008.
 */
export function billingStartFor(leaseStart: string, paidThrough: string | null): string {
  const leaseMonth = monthKeyOf(leaseStart);
  if (!paidThrough) return leaseMonth;
  const afterPaid = addMonthsToKey(monthKeyOf(paidThrough), 1);
  return afterPaid > leaseMonth ? afterPaid : leaseMonth;
}

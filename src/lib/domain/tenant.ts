import { addMonthsToKey, monthKeyOf } from "@/lib/dates";
import {
  PREFERRED_CHANNELS,
  TENANT_KINDS,
  UNIT_TYPES,
  type PreferredChannel,
  type TenantKind,
  type TenantStatus,
  type UnitType,
} from "@/lib/types";

/** How each tenant status reads and which badge tone it gets; the one mapping every screen uses. */
export const TENANT_STATUS_DISPLAY: Record<TenantStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  draft: { label: "Draft", tone: "warning" },
  inactive: { label: "Moved out", tone: "neutral" },
};

export const TENANT_KIND_LABELS: Record<TenantKind, string> = {
  individual: "Individual",
  business: "Business",
  government: "Government",
};
export const TENANT_KIND_OPTIONS = TENANT_KINDS.map((value) => ({ value, label: TENANT_KIND_LABELS[value] }));

/** Only a government tenant may leave the phone empty or its rent untracked (0016). */
export function isGovernment(kind: TenantKind): boolean {
  return kind === "government";
}

/**
 * Whether the app bills this tenant: active, and its rent tracked here. A
 * government tenant whose rent goes straight to the owner's bank has no rent
 * months, no dues and no "Record payment" (0016).
 */
export function isRentTracked(tenant: { status: TenantStatus; rentTracked: boolean }): boolean {
  return tenant.status === "active" && tenant.rentTracked;
}

/** Tags shown next to a tenant's name: "Govt", plus "Rent paid direct" while its rent isn't tracked (0016). */
export function tenantKindTags(tenant: { tenantKind: TenantKind; rentTracked: boolean }): string[] {
  if (!isGovernment(tenant.tenantKind)) return [];
  return tenant.rentTracked ? ["Govt"] : ["Govt", "Rent paid direct"];
}

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  residential: "Residential",
  commercial: "Commercial",
};
export const UNIT_TYPE_OPTIONS = UNIT_TYPES.map((value) => ({ value, label: UNIT_TYPE_LABELS[value] }));

export const PREFERRED_CHANNEL_LABELS: Record<PreferredChannel, string> = {
  both: "WhatsApp + SMS",
  whatsapp: "WhatsApp only",
  sms: "SMS only",
};
export const PREFERRED_CHANNEL_OPTIONS = PREFERRED_CHANNELS.map((value) => ({
  value,
  label: PREFERRED_CHANNEL_LABELS[value],
}));

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
  if (mix === "commercial" || mix === "residential") return UNIT_TYPE_LABELS[mix];
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

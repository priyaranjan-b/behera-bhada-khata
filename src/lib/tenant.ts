export interface UnitLike {
  tower?: string | null;
  floor?: string | null;
  house_number?: string | null;
}

// Compact identifier for a rental unit, e.g. "Tower B · Floor 3 · #12".
export function formatUnitLabel(unit: UnitLike): string {
  const parts = [
    unit.tower || null,
    unit.floor ? `Floor ${unit.floor}` : null,
    unit.house_number ? `#${unit.house_number}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export interface TenantDisplayLike {
  name: string;
  business_name?: string | null;
}

// Commercial tenants are usually looked for by their business/shop name;
// the personal contact name becomes secondary.
export function tenantDisplayName(tenant: TenantDisplayLike): string {
  return tenant.business_name || tenant.name;
}

import "server-only";
import type { AvailableUnit, TenantHouse } from "@/lib/contracts";
import { currentMonthKey, todayKey } from "@/lib/dates";
import { unitMix, type UnitMix } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { Property, TenantRentRate, Unit, UnitOccupancy } from "@/lib/types";
import type { OwnerRepositories } from "@/server/ports";

// Who is in which house, and at what rent - derived from the dated history
// tables (tenant_units via the unit_occupancy view, tenant_rent_rates).

/** The tenancy covers today or starts later, so the house isn't free for anyone else. */
export function holdsUnit(o: Pick<UnitOccupancy, "end_date">, today = todayKey()): boolean {
  return o.end_date === null || o.end_date >= today;
}

/**
 * A tenant's houses now - or, once they've moved out, the houses they had
 * last (so a former tenant still shows where they lived).
 */
export function currentTenancies(history: UnitOccupancy[], today = todayKey()): UnitOccupancy[] {
  const holding = history.filter((o) => holdsUnit(o, today));
  if (holding.length > 0 || history.length === 0) return holding;
  const lastEnd = history.reduce((max, o) => ((o.end_date ?? "") > max ? (o.end_date ?? "") : max), "");
  return history.filter((o) => o.end_date === lastEnd);
}

/** Combined rent in effect for `monthKey`; before the first rate, the first rate. */
export function rentInEffect(rates: TenantRentRate[], monthKey = currentMonthKey()): number {
  const sorted = [...rates].sort((a, b) => a.effective_month.localeCompare(b.effective_month));
  const inEffect = sorted.filter((r) => r.effective_month <= monthKey).pop() ?? sorted[0];
  return inEffect ? Number(inEffect.monthly_amount) : 0;
}

/**
 * Each tower's monthly rent from its current occupants. Rent is per tenant,
 * so a tenant with houses in several towers is split evenly across the
 * houses they live in today; the towers then add up to the true total.
 */
export function rentByProperty(
  occupancy: UnitOccupancy[],
  rates: TenantRentRate[],
  today = todayKey(),
  monthKey = currentMonthKey()
): Map<string, number> {
  const living = occupancy.filter((o) => o.start_date <= today && holdsUnit(o, today));
  const housesByTenant = groupBy(living, (o) => o.tenant_id);
  const ratesByTenant = groupBy(rates, (r) => r.tenant_id);
  const totals = new Map<string, number>();
  for (const [tenantId, houses] of housesByTenant) {
    const share = rentInEffect(ratesByTenant.get(tenantId) ?? [], monthKey) / houses.length;
    for (const o of houses) totals.set(o.property_code, (totals.get(o.property_code) ?? 0) + share);
  }
  for (const [code, amount] of totals) totals.set(code, round2(amount));
  return totals;
}

export interface Placements {
  unitsByCode: Map<string, Unit>;
  propertiesByCode: Map<string, Property>;
  historyByTenant: Map<string, UnitOccupancy[]>;
  ratesByTenant: Map<string, TenantRentRate[]>;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

/** Houses, towers, tenancies and rent rates for a set of tenants, in four queries. */
export async function loadPlacements(db: OwnerRepositories, tenantIds: string[]): Promise<Placements> {
  const [history, rates, properties] = await Promise.all([
    tenantIds.length ? db.occupancy.list({ tenantIds }) : Promise.resolve([]),
    tenantIds.length ? db.rentRates.listForTenants(tenantIds) : Promise.resolve([]),
    db.properties.list(),
  ]);
  const unitCodes = [...new Set(history.map((o) => o.unit_code))];
  const units = unitCodes.length ? await db.units.list({ unitCodes }) : [];
  return {
    unitsByCode: new Map(units.map((u) => [u.unit_code, u])),
    propertiesByCode: new Map(properties.map((p) => [p.property_code, p])),
    historyByTenant: groupBy(history, (o) => o.tenant_id),
    ratesByTenant: groupBy(rates, (r) => r.tenant_id),
  };
}

export interface TenantPlacement {
  houses: TenantHouse[];
  unitCodes: string[];
  unitMix: UnitMix | null;
  /** Tower name(s) of the current houses, e.g. "Tower 1" or "Tower 1, Tower 2". */
  propertyName: string;
  monthlyRent: number;
}

export function placementOf(p: Placements, tenantId: string): TenantPlacement {
  const current = currentTenancies(p.historyByTenant.get(tenantId) ?? []);
  const houses: TenantHouse[] = current
    .map((o) => {
      const unit = p.unitsByCode.get(o.unit_code);
      return {
        unitCode: o.unit_code,
        propertyCode: o.property_code,
        propertyName: p.propertiesByCode.get(o.property_code)?.name ?? o.property_code,
        unitType: unit?.unit_type ?? "residential",
        label: unit?.label ?? null,
      };
    })
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  return {
    houses,
    unitCodes: houses.map((h) => h.unitCode),
    unitMix: unitMix(houses.map((h) => h.unitType)),
    propertyName: [...new Set(houses.map((h) => h.propertyName))].join(", ") || "—",
    monthlyRent: rentInEffect(p.ratesByTenant.get(tenantId) ?? []),
  };
}

/**
 * Houses a tenant can be given: in use and not held by anyone. Houses held by
 * `exceptTenantId` (the tenant being edited) are included, so their current
 * houses can stay selected.
 */
export async function availableUnits(db: OwnerRepositories, exceptTenantId?: string): Promise<AvailableUnit[]> {
  const [units, occupancy, properties] = await Promise.all([
    db.units.list(),
    db.occupancy.list(),
    db.properties.list(),
  ]);
  const today = todayKey();
  const held = new Set(
    occupancy.filter((o) => o.tenant_id !== exceptTenantId && holdsUnit(o, today)).map((o) => o.unit_code)
  );
  const propertyName = new Map(properties.map((p) => [p.property_code, p.name]));
  return units
    .filter((u) => u.is_active && !held.has(u.unit_code))
    .map((u) => ({
      unitCode: u.unit_code,
      propertyCode: u.property_code,
      propertyName: propertyName.get(u.property_code) ?? u.property_code,
      unitType: u.unit_type,
      label: u.label,
      floor: u.floor,
    }));
}

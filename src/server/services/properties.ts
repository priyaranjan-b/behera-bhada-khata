import "server-only";
import type {
  LocationGroup,
  NewHouseForm,
  NewPropertyForm,
  NewTenantForm,
  PropertyDetail,
  PropertyHeader,
  UnitRow,
} from "@/lib/contracts";
import { todayKey } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { tenantDisplayName } from "@/lib/domain/tenant";
import type { Location, Property, Unit, UnitOccupancy } from "@/lib/types";
import { createPropertySchema, createUnitSchema, propertyCodeSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import { notFound, parseInput, withParams, type OwnerContext } from "./context";
import { availableUnits, holdsUnit, loadPlacements, placementOf, rentByProperty } from "./placements";

function toHeader(property: Property, locations: Location[]): PropertyHeader {
  return {
    code: property.property_code,
    name: property.name,
    locationCode: property.location_code,
    locationName: locations.find((l) => l.location_code === property.location_code)?.name ?? property.location_code,
  };
}

/** Normalises a code from the URL; anything malformed is simply "not found". */
function parsePropertyCode(raw: string): string {
  const parsed = propertyCodeSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound("Property");
  return parsed.data;
}

async function loadHeader(ctx: OwnerContext, rawCode: string): Promise<PropertyHeader> {
  const db = await ownerDb();
  const [property, locations] = await Promise.all([db.properties.get(parsePropertyCode(rawCode)), db.locations.list()]);
  if (!property) notFound("Property");
  return toHeader(property, locations);
}

/** Every site with its towers, how full each one is and the rent its current occupants pay. */
export async function listProperties(_ctx: OwnerContext): Promise<LocationGroup[]> {
  const db = await ownerDb();
  const [locations, properties, units, occupancy] = await Promise.all([
    db.locations.list(),
    db.properties.list(),
    db.units.list(),
    db.occupancy.list(),
  ]);
  const today = todayKey();
  const held = new Set(occupancy.filter((o) => holdsUnit(o, today)).map((o) => o.unit_code));
  const tenantIds = [...new Set(occupancy.filter((o) => holdsUnit(o, today)).map((o) => o.tenant_id))];
  const rates = tenantIds.length ? await db.rentRates.listForTenants(tenantIds) : [];
  const rent = rentByProperty(occupancy, rates, today);

  return locations.map((location) => {
    const cards = properties
      .filter((p) => p.location_code === location.location_code)
      .map((p) => {
        const inTower = units.filter((u) => u.property_code === p.property_code && u.is_active);
        return {
          ...toHeader(p, locations),
          totalUnits: inTower.length,
          occupiedUnits: inTower.filter((u) => held.has(u.unit_code)).length,
          residentialUnits: inTower.filter((u) => u.unit_type === "residential").length,
          commercialUnits: inTower.filter((u) => u.unit_type === "commercial").length,
          monthlyRent: rent.get(p.property_code) ?? 0,
        };
      });
    return {
      location: { code: location.location_code, name: location.name, address: location.address },
      properties: cards,
      monthlyRent: round2(cards.reduce((sum, c) => sum + c.monthlyRent, 0)),
    };
  });
}

export async function getPropertyHeader(ctx: OwnerContext, propertyCode: string): Promise<PropertyHeader> {
  return loadHeader(ctx, propertyCode);
}

/** Table rows for houses: who is in each today, and who was. */
function toUnitRows(
  units: Unit[],
  occupancy: UnitOccupancy[],
  properties: Property[],
  locations: Location[],
  today = todayKey()
): UnitRow[] {
  const headers = new Map(properties.map((p) => [p.property_code, toHeader(p, locations)]));
  return units.map((unit) => {
    const history = occupancy.filter((o) => o.unit_code === unit.unit_code);
    const holder = history.find((o) => holdsUnit(o, today));
    const header = headers.get(unit.property_code);
    return {
      unitCode: unit.unit_code,
      propertyCode: unit.property_code,
      propertyName: header?.name ?? unit.property_code,
      locationName: header?.locationName ?? "",
      houseNumber: unit.house_number,
      floor: unit.floor,
      unitType: unit.unit_type,
      label: unit.label,
      isActive: unit.is_active,
      currentTenant: holder
        ? {
            id: holder.tenant_id,
            displayName: tenantDisplayName({ name: holder.tenant_name, business_name: holder.tenant_business_name }),
            since: holder.start_date,
          }
        : null,
      history: history.map((o) => ({
        tenantId: o.tenant_id,
        tenantName: tenantDisplayName({ name: o.tenant_name, business_name: o.tenant_business_name }),
        startDate: o.start_date,
        endDate: o.end_date,
      })),
    };
  });
}

/** Every house in every tower (/dashboard/houses), by tower then house. */
export async function listHouses(_ctx: OwnerContext): Promise<UnitRow[]> {
  const db = await ownerDb();
  const [locations, properties, units, occupancy] = await Promise.all([
    db.locations.list(),
    db.properties.list(),
    db.units.list(),
    db.occupancy.list(),
  ]);
  return toUnitRows(units, occupancy, properties, locations);
}

/** A tower: its houses (with who is in each, and who was) and its current tenants. */
export async function getPropertyDetail(ctx: OwnerContext, rawCode: string): Promise<PropertyDetail> {
  const code = parsePropertyCode(rawCode);
  const db = await ownerDb();
  const [property, locations, units, occupancy] = await Promise.all([
    db.properties.get(code),
    db.locations.list(),
    db.units.list({ propertyCode: code }),
    db.occupancy.list({ propertyCode: code }),
  ]);
  if (!property) notFound("Property");

  const today = todayKey();
  const unitRows = toUnitRows(units, occupancy, [property], locations, today);

  // Tenants currently holding a house in this tower.
  const tenantIds = [...new Set(occupancy.filter((o) => holdsUnit(o, today)).map((o) => o.tenant_id))];
  const [tenants, placements] = await Promise.all([db.tenants.list(), loadPlacements(db, tenantIds)]);
  const tenantRows = tenants
    .filter((t) => tenantIds.includes(t.id))
    .map((tenant) => {
      const placement = placementOf(placements, tenant.id);
      return {
        id: tenant.id,
        displayName: tenantDisplayName(tenant),
        contactName: tenant.business_name ? tenant.name : null,
        unitMix: placement.unitMix,
        unitCodes: placement.unitCodes.filter((c) => c.startsWith(`${code}-`)),
        phone: tenant.phone,
        monthlyRent: placement.monthlyRent,
        status: tenant.status,
      };
    });

  return { property: toHeader(property, locations), units: unitRows, tenants: tenantRows };
}

export async function getNewPropertyForm(_ctx: OwnerContext): Promise<NewPropertyForm> {
  const db = await ownerDb();
  const locations = await db.locations.list();
  return { locations: locations.map((l) => ({ code: l.location_code, name: l.name, address: l.address })) };
}

/** Adds a tower to a site; its code is `<site>-<tower>`, e.g. AC-T3, and never changes. */
export async function createProperty(ctx: OwnerContext, body: unknown): Promise<{ code: string }> {
  const input = parseInput(createPropertySchema, body);
  const db = await ownerDb();
  const code = `${input.locationCode}-${input.towerCode}`;
  await db.properties.create({ property_code: code, location_code: input.locationCode, name: input.name });
  return { code };
}

/** Adds a house to a tower; its code is `<tower>-<house number>`, e.g. AC-T1-G13. */
export async function createUnit(ctx: OwnerContext, rawCode: string, body: unknown): Promise<{ code: string }> {
  const propertyCode = parsePropertyCode(rawCode);
  const input = parseInput(createUnitSchema, withParams(body, { propertyCode }));
  const db = await ownerDb();
  if (!(await db.properties.get(propertyCode))) notFound("Property");
  const code = `${propertyCode}-${input.houseNumber}`;
  await db.units.create({
    unit_code: code,
    property_code: propertyCode,
    floor: input.floor || null,
    unit_type: input.unitType,
    label: input.label || null,
  });
  return { code };
}

/** The "add tenant" form opened from a tower: that tower, plus every vacant house. */
/** Every tower, for the "Add house" shortcut's tower picker. */
export async function getNewHouseForm(_ctx: OwnerContext): Promise<NewHouseForm> {
  const db = await ownerDb();
  const [properties, locations] = await Promise.all([db.properties.list(), db.locations.list()]);
  return {
    towers: properties
      .map((p) => toHeader(p, locations))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
}

export async function getNewTenantForm(ctx: OwnerContext, rawCode: string): Promise<NewTenantForm> {
  const property = await loadHeader(ctx, rawCode);
  const db = await ownerDb();
  return { property, availableUnits: await availableUnits(db) };
}

import "server-only";
import { asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { Location, Property, Unit, UnitOccupancy } from "@/lib/types";
import type { HouseRent, NewProperty, NewUnit } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { locations, properties, unitOccupancy, units } from "../schema";

// Plain reads of the place master data (0006) and who lived where. Same
// filters and order as the Supabase adapter this replaced (A19), each order
// ending in a unique key so ties come back the same every time. Id lists go
// in as bound parameters, one query, so there is no chunking and no re-sort
// in JS.

/** By code. */
export function listLocations(tx: Tx): Promise<Location[]> {
  return tx.select().from(locations).orderBy(asc(locations.location_code));
}

/** By code. */
export function listProperties(tx: Tx): Promise<Property[]> {
  return tx.select().from(properties).orderBy(asc(properties.property_code));
}

export async function getProperty(tx: Tx, propertyCode: string): Promise<Property | null> {
  const [row] = await tx.select().from(properties).where(eq(properties.property_code, propertyCode));
  return row ?? null;
}

// tenant_reader may not read the house rent (0036, D39): a former tenant
// would see what their old house goes for now. Its rows say null for it.
const { base_rent: _rent, ...UNIT_COLUMNS_WITHOUT_RENT } = getTableColumns(units);

/**
 * By code: all, one tower's, or just `unitCodes` (which wins over
 * `propertyCode`, as in the old Supabase adapter). `withoutRent` for the
 * tenant portal, whose role can't read `base_rent`.
 */
export async function listUnits(
  tx: Tx,
  filter: { propertyCode?: string; unitCodes?: string[] } = {},
  options: { withoutRent?: boolean } = {}
): Promise<Unit[]> {
  if (filter.unitCodes?.length === 0) return [];
  const where = filter.unitCodes
    ? inArray(units.unit_code, filter.unitCodes)
    : filter.propertyCode
      ? eq(units.property_code, filter.propertyCode)
      : undefined;
  if (options.withoutRent) {
    const rows = await tx.select(UNIT_COLUMNS_WITHOUT_RENT).from(units).where(where).orderBy(asc(units.unit_code));
    return rows.map((r) => ({ ...r, base_rent: null }));
  }
  return tx.select().from(units).where(where).orderBy(asc(units.unit_code));
}

/**
 * House rents (D39), in one statement; an empty list writes nothing. Called
 * in the same transaction as the tenant write that set the rent, or alone
 * for the Houses page's "Set rent". null clears a house's rent. A house
 * whose rent is unchanged isn't touched (no updated_at bump). A code with
 * no house is a bug upstream (the service checked the houses): it throws,
 * so the transaction, tenant write included, rolls back.
 */
export async function setHouseRents(tx: Tx, rents: HouseRent[]): Promise<void> {
  if (rents.length === 0) return;
  const values = sql.join(
    rents.map((r) => sql`(${r.unit_code}::text, ${r.base_rent}::numeric)`),
    sql`, `
  );
  const missing = await executeRows<{ unit_code: string }>(
    tx,
    sql`
      with v(unit_code, base_rent) as (values ${values}),
      changed as (
        update units u set base_rent = v.base_rent
        from v
        where u.unit_code = v.unit_code and u.base_rent is distinct from v.base_rent
        returning u.unit_code
      )
      select v.unit_code from v where not exists (select 1 from units u where u.unit_code = v.unit_code)
    `
  );
  if (missing.length > 0) throw new Error(`no house ${missing.map((m) => m.unit_code).join(", ")} to set the rent of`);
}

/**
 * Oldest tenancy first, then by house (a house's tenancies never overlap, so
 * that is unique): some tenants' (`tenantIds` wins over `propertyCode`), one
 * tower's, or all.
 */
export async function listOccupancy(
  tx: Tx,
  filter: { tenantIds?: string[]; propertyCode?: string } = {}
): Promise<UnitOccupancy[]> {
  if (filter.tenantIds?.length === 0) return [];
  const where = filter.tenantIds
    ? inArray(unitOccupancy.tenant_id, filter.tenantIds)
    : filter.propertyCode
      ? eq(unitOccupancy.property_code, filter.propertyCode)
      : undefined;
  return tx
    .select()
    .from(unitOccupancy)
    .where(where)
    .orderBy(asc(unitOccupancy.start_date), asc(unitOccupancy.unit_code));
}

/** A new tower; its code is permanent (a trigger refuses a change, D2). */
export async function createProperty(tx: Tx, input: NewProperty): Promise<void> {
  await tx.insert(properties).values(input);
}

/** A new house. */
export async function createUnit(tx: Tx, input: NewUnit): Promise<void> {
  await tx.insert(units).values(input);
}

export async function getLocation(tx: Tx, locationCode: string): Promise<Location | null> {
  const [row] = await tx.select().from(locations).where(eq(locations.location_code, locationCode));
  return row ?? null;
}

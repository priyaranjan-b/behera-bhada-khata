import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { Location, Property, Unit, UnitOccupancy } from "@/lib/types";
import type { NewProperty, NewUnit } from "@/server/ports";
import type { Tx } from "../client";
import { locations, properties, unitOccupancy, units } from "../schema";

// Plain reads of the place master data (0006) and who lived where. Same
// filters and order as the Supabase adapter (src/server/adapters/supabase/db.ts),
// each order ending in a unique key so ties come back the same every time.
// Id lists go in as bound parameters, one query, so unlike the Supabase
// adapter there is no chunking and no re-sort in JS (A19).

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

/** By code: all, one tower's, or just `unitCodes` (which wins over `propertyCode`, as in the Supabase adapter). */
export async function listUnits(tx: Tx, filter: { propertyCode?: string; unitCodes?: string[] } = {}): Promise<Unit[]> {
  if (filter.unitCodes?.length === 0) return [];
  const where = filter.unitCodes
    ? inArray(units.unit_code, filter.unitCodes)
    : filter.propertyCode
      ? eq(units.property_code, filter.propertyCode)
      : undefined;
  return tx.select().from(units).where(where).orderBy(asc(units.unit_code));
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

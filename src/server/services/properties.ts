import "server-only";
import type { Created, PropertyCard, PropertyDetail, PropertyHeader } from "@/lib/contracts";
import { formatUnitLabel, tenantDisplayName } from "@/lib/tenant";
import type { Property } from "@/lib/types";
import { createPropertySchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import { notFound, parseInput, type OwnerContext } from "./context";

function toHeader(property: Property): PropertyHeader {
  return { id: property.id, name: property.name, address: property.address };
}

export async function listProperties(ctx: OwnerContext): Promise<PropertyCard[]> {
  const db = await ownerDb(ctx.ownerId);
  const [properties, tenants] = await Promise.all([db.properties.list(), db.tenants.list({ status: "active" })]);

  const counts = new Map<string, { residential: number; commercial: number }>();
  for (const t of tenants) {
    const c = counts.get(t.property_id) ?? { residential: 0, commercial: 0 };
    c[t.unit_type] += 1;
    counts.set(t.property_id, c);
  }

  return properties.map((p) => ({
    ...toHeader(p),
    residentialTenants: counts.get(p.id)?.residential ?? 0,
    commercialTenants: counts.get(p.id)?.commercial ?? 0,
  }));
}

export async function getPropertyHeader(ctx: OwnerContext, propertyId: string): Promise<PropertyHeader> {
  const db = await ownerDb(ctx.ownerId);
  const property = await db.properties.get(propertyId);
  if (!property) notFound("Property");
  return toHeader(property);
}

export async function getPropertyDetail(ctx: OwnerContext, propertyId: string): Promise<PropertyDetail> {
  const db = await ownerDb(ctx.ownerId);
  const [property, tenants] = await Promise.all([db.properties.get(propertyId), db.tenants.list({ propertyId })]);
  if (!property) notFound("Property");

  return {
    property: toHeader(property),
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      displayName: tenantDisplayName(tenant),
      contactName: tenant.business_name ? tenant.name : null,
      unitType: tenant.unit_type,
      unitLabel: formatUnitLabel(tenant),
      phone: tenant.phone,
      monthlyRent: Number(tenant.monthly_rent_amount),
      status: tenant.status,
    })),
  };
}

export async function createProperty(ctx: OwnerContext, body: unknown): Promise<Created> {
  const input = parseInput(createPropertySchema, body);
  const db = await ownerDb(ctx.ownerId);
  return db.properties.create({ name: input.name, address: input.address ?? null });
}

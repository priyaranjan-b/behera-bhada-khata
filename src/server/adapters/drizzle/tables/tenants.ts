import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Tenant, TenantRentRate, TenantStatus } from "@/lib/types";
import type { Tx } from "../client";
import { tenantRentRates, tenants } from "../schema";

// Plain reads of tenants and their dated rents (0006). Writes stay in the SQL
// lifecycle functions (create_tenant, update_tenant, ...; D9). Each order ends
// in the id so ties come back the same every time, as in the old Supabase adapter.

/** Oldest first. */
export function listTenants(tx: Tx, filter: { status?: TenantStatus } = {}): Promise<Tenant[]> {
  return tx
    .select()
    .from(tenants)
    .where(filter.status ? eq(tenants.status, filter.status) : undefined)
    .orderBy(asc(tenants.created_at), asc(tenants.id));
}

export async function getTenant(tx: Tx, id: string): Promise<Tenant | null> {
  const [row] = await tx.select().from(tenants).where(eq(tenants.id, id));
  return row ?? null;
}

/** Oldest rate first; one query however many tenants (no chunking, A19). */
export async function listRentRates(tx: Tx, tenantIds: string[]): Promise<TenantRentRate[]> {
  if (tenantIds.length === 0) return [];
  return tx
    .select()
    .from(tenantRentRates)
    .where(inArray(tenantRentRates.tenant_id, tenantIds))
    .orderBy(asc(tenantRentRates.effective_month), asc(tenantRentRates.id));
}

/** Active and moved-out tenants with this phone, oldest first: who may sign in to the tenant portal (A32). */
export function listTenantsByPhone(tx: Tx, phone: string): Promise<Tenant[]> {
  return tx
    .select()
    .from(tenants)
    .where(and(eq(tenants.phone, phone), inArray(tenants.status, ["active", "inactive"])))
    .orderBy(asc(tenants.created_at), asc(tenants.id));
}

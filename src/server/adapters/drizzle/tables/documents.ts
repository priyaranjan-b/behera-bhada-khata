import "server-only";
import { asc, eq } from "drizzle-orm";
import type { TenantDocument } from "@/lib/types";
import type { NewTenantDocument } from "@/server/ports";
import type { Tx } from "../client";
import { tenantDocuments } from "../schema";

// Files kept on a tenant (0011, D21): added and deleted, never edited (the
// owner role has UPDATE revoked). Plain reads and writes under RLS; the
// audit trigger records each add and delete.

/** Oldest first, then by path (as the old Supabase adapter ordered them). */
export function listTenantDocuments(tx: Tx, tenantId: string): Promise<TenantDocument[]> {
  return tx
    .select()
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenant_id, tenantId))
    .orderBy(asc(tenantDocuments.created_at), asc(tenantDocuments.storage_path));
}

/** Every tenant with at least one document. */
export async function tenantIdsWithDocuments(tx: Tx): Promise<string[]> {
  const rows = await tx.selectDistinct({ tenant_id: tenantDocuments.tenant_id }).from(tenantDocuments);
  return rows.map((r) => r.tenant_id);
}

export async function getTenantDocument(tx: Tx, id: string): Promise<TenantDocument | null> {
  const [row] = await tx.select().from(tenantDocuments).where(eq(tenantDocuments.id, id));
  return row ?? null;
}

/** All in one insert: every row or none. */
export async function createTenantDocuments(tx: Tx, rows: NewTenantDocument[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(tenantDocuments).values(rows);
}

/** False if no such document. */
export async function removeTenantDocument(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx.delete(tenantDocuments).where(eq(tenantDocuments.id, id)).returning({ id: tenantDocuments.id });
  return rows.length > 0;
}

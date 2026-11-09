import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { TenantSession } from "@/lib/types";
import type { NewTenantSession } from "@/server/ports";
import type { Tx } from "../client";
import { tenantSessions } from "../schema";

// Tenant portal sign-ins (0033, D37, A32): service role only (RLS on, no
// policies). Only the token's hash is ever stored or looked up.

export async function createTenantSession(tx: Tx, row: NewTenantSession): Promise<void> {
  await tx.insert(tenantSessions).values(row);
}

/** Not revoked and not expired, on the database's clock. */
const active = () => and(isNull(tenantSessions.revoked_at), gt(tenantSessions.expires_at, sql`now()`));

export async function findActiveTenantSession(tx: Tx, tokenHash: string): Promise<TenantSession | null> {
  const [row] = await tx
    .select()
    .from(tenantSessions)
    .where(and(eq(tenantSessions.token_hash, tokenHash), active()));
  return row ?? null;
}

export async function chooseTenantSessionTenancy(tx: Tx, id: string, tenantId: string): Promise<boolean> {
  const rows = await tx
    .update(tenantSessions)
    .set({ tenant_id: tenantId })
    .where(and(eq(tenantSessions.id, id), active()))
    .returning({ id: tenantSessions.id });
  return rows.length > 0;
}

export async function revokeTenantSession(tx: Tx, id: string): Promise<void> {
  await tx
    .update(tenantSessions)
    .set({ revoked_at: sql`now()` })
    .where(and(eq(tenantSessions.id, id), isNull(tenantSessions.revoked_at)));
}

/** Sessions that expired or were revoked over 30 days ago: long enough to look into a sign-in, no longer. */
export async function pruneTenantSessions(tx: Tx): Promise<number> {
  const rows = await tx
    .delete(tenantSessions)
    // Two plain comparisons, so the expires_at index serves the usual case.
    .where(
      sql`${tenantSessions.expires_at} < now() - interval '30 days' or ${tenantSessions.revoked_at} < now() - interval '30 days'`
    )
    .returning({ id: tenantSessions.id });
  return rows.length;
}

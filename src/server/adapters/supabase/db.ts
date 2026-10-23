import "server-only";
import type { OwnerRepositories, SystemRepositories } from "@/server/ports";
import { createAdminClient, createSessionClient, must, mustWrite, type Supabase } from "./clients";

const PENDING = "pending" as const;

/**
 * Owner-scoped repositories. Uses the owner's session client, so RLS applies;
 * the explicit owner_id filters say the same thing in a form any other
 * database adapter has to reproduce.
 */
export async function supabaseOwnerRepositories(ownerId: string): Promise<OwnerRepositories> {
  const db = await createSessionClient();

  return {
    properties: {
      async list() {
        return must(
          await db.from("properties").select("*").eq("owner_id", ownerId).order("created_at", { ascending: true }),
          "list properties"
        );
      },
      async get(id) {
        return must(
          await db.from("properties").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle(),
          "get property"
        );
      },
      async create(input) {
        return mustWrite(
          await db
            .from("properties")
            .insert({ ...input, owner_id: ownerId })
            .select("id")
            .single()
        );
      },
    },

    tenants: {
      async list(filter = {}) {
        let query = db.from("tenants").select("*").eq("owner_id", ownerId);
        if (filter.status) query = query.eq("status", filter.status);
        if (filter.propertyId) query = query.eq("property_id", filter.propertyId);
        return must(await query.order("created_at", { ascending: true }), "list tenants");
      },
      async get(id) {
        return must(
          await db.from("tenants").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle(),
          "get tenant"
        );
      },
      async create(input) {
        return mustWrite(
          await db
            .from("tenants")
            .insert({ ...input, owner_id: ownerId })
            .select("id")
            .single()
        );
      },
    },

    rentPeriods: {
      async listForTenants(tenantIds) {
        if (tenantIds.length === 0) return [];
        return must(
          await db
            .from("rent_periods")
            .select("*")
            .in("tenant_id", tenantIds)
            .order("period_month", { ascending: true }),
          "list rent periods"
        );
      },
      async listByIds(ids) {
        if (ids.length === 0) return [];
        return must(await db.from("rent_periods").select("*").in("id", ids), "list rent periods");
      },
    },

    payments: {
      async listForTenants(tenantIds, filter = {}) {
        if (tenantIds.length === 0) return [];
        let query = db.from("payments").select("*").eq("owner_id", ownerId).in("tenant_id", tenantIds);
        if (filter.status) query = query.eq("status", filter.status);
        return must(await query, "list payments");
      },
      async get(id) {
        return must(
          await db.from("payments").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle(),
          "get payment"
        );
      },
      async create(payment, allocations) {
        mustWrite(await db.from("payments").insert({ ...payment, owner_id: ownerId }));
        mustWrite(
          await db
            .from("payment_allocations")
            .insert(allocations.map((a) => ({ ...a, payment_id: payment.id })))
        );
      },
      async listAllocations(paymentId) {
        return must(
          await db.from("payment_allocations").select("*").eq("payment_id", paymentId),
          "list payment allocations"
        );
      },
      async rotateToken(id, tokenHash, expiresAt) {
        // The owner's UPDATE grant covers only these two columns (0001_init.sql).
        mustWrite(
          await db
            .from("payments")
            .update({ token_hash: tokenHash, token_expires_at: expiresAt })
            .eq("owner_id", ownerId)
            .eq("id", id)
            .eq("status", PENDING)
        );
      },
    },

    adjustments: {
      async listForTenants(tenantIds, filter = {}) {
        if (tenantIds.length === 0) return [];
        let query = db.from("adjustments").select("*").eq("owner_id", ownerId).in("tenant_id", tenantIds);
        if (filter.status) query = query.eq("status", filter.status);
        return must(await query, "list adjustments");
      },
      async get(id) {
        return must(
          await db.from("adjustments").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle(),
          "get adjustment"
        );
      },
      async create(adjustment, allocations) {
        mustWrite(await db.from("adjustments").insert({ ...adjustment, owner_id: ownerId }));
        mustWrite(
          await db
            .from("adjustment_allocations")
            .insert(allocations.map((a) => ({ ...a, adjustment_id: adjustment.id })))
        );
      },
      async rotateToken(id, tokenHash, expiresAt) {
        mustWrite(
          await db
            .from("adjustments")
            .update({ token_hash: tokenHash, token_expires_at: expiresAt })
            .eq("owner_id", ownerId)
            .eq("id", id)
            .eq("status", PENDING)
        );
      },
    },
  };
}

/** Unscoped repositories on the service-role client (bypasses RLS). */
export function supabaseSystemRepositories(): SystemRepositories {
  const db: Supabase = createAdminClient();

  return {
    properties: {
      async get(id) {
        return must(await db.from("properties").select("*").eq("id", id).maybeSingle(), "get property");
      },
    },

    tenants: {
      async get(id) {
        return must(await db.from("tenants").select("*").eq("id", id).maybeSingle(), "get tenant");
      },
      async listActiveIds() {
        const rows = must(await db.from("tenants").select("id").eq("status", "active"), "list tenants");
        return rows.map((r) => r.id);
      },
    },

    rentPeriods: {
      async listForTenant(tenantId) {
        return must(
          await db
            .from("rent_periods")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("period_month", { ascending: true }),
          "list rent periods"
        );
      },
      async listByIds(ids) {
        if (ids.length === 0) return [];
        return must(await db.from("rent_periods").select("*").in("id", ids), "list rent periods");
      },
      async insertMany(rows) {
        if (rows.length === 0) return;
        // unique (tenant_id, period_month): a concurrent request creating the
        // same month is fine, so skip duplicates instead of failing.
        must(
          await db.from("rent_periods").upsert(rows, { onConflict: "tenant_id,period_month", ignoreDuplicates: true }),
          "insert rent periods"
        );
      },
      async addToAllocated(id, delta) {
        const period = must<{ amount_allocated: string } | null>(
          await db.from("rent_periods").select("amount_allocated").eq("id", id).maybeSingle(),
          "get rent period"
        );
        if (!period) return;
        const amount = Math.max(0, Number(period.amount_allocated) + delta);
        must(await db.from("rent_periods").update({ amount_allocated: amount }).eq("id", id), "update rent period");
      },
    },

    payments: {
      async findByTokenHash(tokenHash) {
        return must(await db.from("payments").select("*").eq("token_hash", tokenHash).maybeSingle(), "find payment");
      },
      async listAllocations(paymentId) {
        return must(
          await db.from("payment_allocations").select("*").eq("payment_id", paymentId),
          "list payment allocations"
        );
      },
      async confirm(id, patch) {
        // `.eq("status", "pending")` makes this a compare-and-swap: of two
        // racing confirmations only the first updates a row.
        const rows = must(
          await db
            .from("payments")
            .update({ ...patch, status: "confirmed" })
            .eq("id", id)
            .eq("status", PENDING)
            .select("id"),
          "confirm payment"
        );
        return rows.length > 0;
      },
    },

    adjustments: {
      async findByTokenHash(tokenHash) {
        return must(
          await db.from("adjustments").select("*").eq("token_hash", tokenHash).maybeSingle(),
          "find adjustment"
        );
      },
      async listAllocations(adjustmentId) {
        return must(
          await db.from("adjustment_allocations").select("*").eq("adjustment_id", adjustmentId),
          "list adjustment allocations"
        );
      },
      async confirm(id, patch) {
        const rows = must(
          await db
            .from("adjustments")
            .update({ ...patch, status: "confirmed" })
            .eq("id", id)
            .eq("status", PENDING)
            .select("id"),
          "confirm adjustment"
        );
        return rows.length > 0;
      },
    },
  };
}

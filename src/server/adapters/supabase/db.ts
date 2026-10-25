import "server-only";
import type { RentPeriod } from "@/lib/types";
import type { AuditEvent, AuditFilter, OwnerRepositories, SystemRepositories } from "@/server/ports";
import { chunk, createAdminClient, createSessionClient, must, mustWrite, type Supabase } from "./clients";

/** One day before a yyyy-MM-dd key, as an ISO timestamp - a safe lower bound for an app-time-zone day. */
function dayBefore(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString();
}

// Asia/Kolkata has no daylight saving, so a day there is a fixed UTC range.
const APP_UTC_OFFSET = "+05:30";

function auditQuery(db: Supabase, filter: AuditFilter) {
  let query = db.from("audit_log").select("*");
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.unitCode) query = query.eq("unit_code", filter.unitCode);
  if (filter.propertyCode) query = query.eq("property_code", filter.propertyCode);
  if (filter.actions?.length) query = query.in("action", [...filter.actions]);
  if (filter.fromDate) query = query.gte("at", `${filter.fromDate}T00:00:00${APP_UTC_OFFSET}`);
  if (filter.toDate) query = query.lte("at", `${filter.toDate}T23:59:59.999${APP_UTC_OFFSET}`);
  if (filter.beforeId !== undefined) query = query.lt("id", filter.beforeId);
  return query.order("id", { ascending: false }).limit(filter.limit);
}

function logEventArgs(event: AuditEvent) {
  return {
    p_action: event.action,
    p_tenant_id: event.tenantId ?? null,
    p_entity_type: event.entityType ?? null,
    p_entity_id: event.entityId ?? null,
    p_context: event.context ?? {},
  };
}

function byPeriodMonth(a: RentPeriod, b: RentPeriod): number {
  return a.period_month.localeCompare(b.period_month);
}

/**
 * The owner's repositories, on the signed-in session client. There is one
 * owner and no owner_id column: RLS (is_app_owner(), 0003_single_owner.sql)
 * returns nothing and refuses every write for anyone else. Another database
 * adapter must enforce the same single-owner check.
 */
export async function supabaseOwnerRepositories(): Promise<OwnerRepositories> {
  const db = await createSessionClient();

  async function ownerPeriods(
    build: (q: ReturnType<typeof periodsQuery>) => ReturnType<typeof periodsQuery>
  ): Promise<RentPeriod[]> {
    return must(await build(periodsQuery()), "list rent periods");
  }

  function periodsQuery() {
    return db.from("rent_periods").select("*");
  }

  return {
    audit: {
      async list(filter) {
        return must(await auditQuery(db, filter), "list audit log");
      },
      async log(event) {
        mustWrite(await db.rpc("log_event", logEventArgs(event)), "log event");
      },
    },

    ownerProfile: {
      async get() {
        return must(await db.from("owner_profile").select("*").maybeSingle(), "get owner profile");
      },
      async save(profile) {
        mustWrite(await db.from("owner_profile").upsert({ singleton: true, ...profile }), "save owner profile");
      },
    },

    locations: {
      async list() {
        return must(
          await db.from("locations").select("*").order("location_code"),
          "list locations"
        );
      },
    },

    properties: {
      async list() {
        return must(
          await db.from("properties").select("*").order("property_code"),
          "list properties"
        );
      },
      async get(propertyCode) {
        return must(
          await db.from("properties").select("*").eq("property_code", propertyCode).maybeSingle(),
          "get property"
        );
      },
      async create(input) {
        mustWrite(await db.from("properties").insert(input), "create property");
      },
    },

    units: {
      async list(filter = {}) {
        if (filter.unitCodes) {
          const batches = await Promise.all(
            chunk(filter.unitCodes).map(async (codes) =>
              must(await db.from("units").select("*").in("unit_code", codes), "list units")
            )
          );
          return batches.flat().sort((a, b) => a.unit_code.localeCompare(b.unit_code));
        }
        let query = db.from("units").select("*");
        if (filter.propertyCode) query = query.eq("property_code", filter.propertyCode);
        return must(await query.order("unit_code"), "list units");
      },
      async create(input) {
        mustWrite(await db.from("units").insert(input), "create unit");
      },
    },

    occupancy: {
      async list(filter = {}) {
        const base = () => db.from("unit_occupancy").select("*");
        if (filter.tenantIds) {
          const batches = await Promise.all(
            chunk(filter.tenantIds).map(async (ids) =>
              must(await base().in("tenant_id", ids).order("start_date"), "list occupancy")
            )
          );
          return batches.flat().sort((a, b) => a.start_date.localeCompare(b.start_date));
        }
        let query = base();
        if (filter.propertyCode) query = query.eq("property_code", filter.propertyCode);
        return must(await query.order("start_date"), "list occupancy");
      },
    },

    tenantDocuments: {
      async list(tenantId) {
        return must(
          await db.from("tenant_documents").select("*").eq("tenant_id", tenantId).order("created_at").order("storage_path"),
          "list tenant documents"
        );
      },
      async tenantIdsWithDocuments() {
        const rows = must(await db.from("tenant_documents").select("tenant_id"), "list tenants with documents");
        return [...new Set(rows.map((r) => r.tenant_id))];
      },
      async get(id) {
        return must(await db.from("tenant_documents").select("*").eq("id", id).maybeSingle(), "get tenant document");
      },
      async create(rows) {
        if (rows.length === 0) return;
        mustWrite(await db.from("tenant_documents").insert(rows), "add tenant documents");
      },
      async remove(id) {
        const deleted = mustWrite(
          await db.from("tenant_documents").delete().eq("id", id).select("id"),
          "delete tenant document"
        );
        return deleted.length > 0;
      },
    },

    rentRates: {
      async listForTenants(tenantIds) {
        const batches = await Promise.all(
          chunk(tenantIds).map(async (ids) =>
            must(
              await db
                .from("tenant_rent_rates")
                .select("*")
                .in("tenant_id", ids)
                .order("effective_month"),
              "list rent rates"
            )
          )
        );
        return batches.flat().sort((a, b) => a.effective_month.localeCompare(b.effective_month));
      },
    },

    tenants: {
      async list(filter = {}) {
        let query = db.from("tenants").select("*");
        if (filter.status) query = query.eq("status", filter.status);
        return must(await query.order("created_at", { ascending: true }), "list tenants");
      },
      async get(id) {
        return must(
          await db.from("tenants").select("*").eq("id", id).maybeSingle(),
          "get tenant"
        );
      },
      async create(input) {
        // One transaction that also checks every house (0006_property_master_data.sql).
        const id = mustWrite(
          await db.rpc("create_tenant", {
            p_name: input.name,
            p_business_name: input.business_name,
            p_phone: input.phone,
            p_preferred_channel: input.preferred_channel,
            p_monthly_rent: input.monthly_rent,
            p_lease_start: input.lease_start,
            p_unit_codes: input.unit_codes,
            p_paid_through: input.paid_through,
            p_deposit_amount: input.deposit_amount,
            p_tenant_kind: input.tenant_kind,
            p_rent_tracked: input.rent_tracked,
          }),
          "create tenant"
        );
        return { id };
      },
      async update(id, changes) {
        mustWrite(
          await db.rpc("update_tenant", {
            p_tenant_id: id,
            p_name: changes.name,
            p_business_name: changes.business_name,
            p_phone: changes.phone,
            p_preferred_channel: changes.preferred_channel,
            p_unit_codes: changes.unit_codes,
            p_units_effective: changes.units_effective,
            p_monthly_rent: changes.monthly_rent,
            p_rent_effective_month: changes.rent_effective_month,
            p_lease_start: changes.lease_start,
            p_paid_through: changes.paid_through,
            p_deposit_amount: changes.deposit_amount,
            p_tenant_kind: changes.tenant_kind,
            p_rent_tracked: changes.rent_tracked,
          }),
          "update tenant"
        );
      },
      async moveOut(id, date) {
        mustWrite(
          await db.rpc("move_out_tenant", { p_tenant_id: id, p_move_out_date: date }),
          "move out tenant"
        );
      },
      async correctPaidThrough(id, paidThrough) {
        return mustWrite(
          await db.rpc("correct_paid_through", { p_tenant_id: id, p_paid_through: paidThrough }),
          "correct paid up to"
        ) as string;
      },
      async startRentTracking(id, monthlyRent, paidThrough) {
        return mustWrite(
          await db.rpc("start_rent_tracking", {
            p_tenant_id: id,
            p_monthly_rent: monthlyRent,
            p_paid_through: paidThrough,
          }),
          "start rent tracking"
        ) as string;
      },
      async stopRentTracking(id) {
        mustWrite(await db.rpc("stop_rent_tracking", { p_tenant_id: id }), "stop rent tracking");
      },
    },

    rentPeriods: {
      async listForTenants(tenantIds, filter = {}) {
        const batches = await Promise.all(
          chunk(tenantIds).map((ids) =>
            ownerPeriods((q) => {
              let query = q.in("tenant_id", ids);
              if (filter.openOnly) query = query.neq("status", "paid");
              else if (filter.openOrFrom) query = query.or(`status.neq.paid,period_month.gte.${filter.openOrFrom}`);
              return query;
            })
          )
        );
        return batches.flat().sort(byPeriodMonth);
      },
      async listByIds(ids) {
        const batches = await Promise.all(chunk(ids).map((part) => ownerPeriods((q) => q.in("id", part))));
        return batches.flat();
      },
    },

    payments: {
      async listForTenants(tenantIds, filter = {}) {
        const batches = await Promise.all(
          chunk(tenantIds).map(async (ids) => {
            let query = db.from("payments").select("*").in("tenant_id", ids);
            if (filter.status) query = query.eq("status", filter.status);
            if (filter.fromDate) query = query.gte("payment_date", filter.fromDate);
            return must(await query, "list payments");
          })
        );
        return batches.flat();
      },
      async get(id) {
        return must(
          await db.from("payments").select("*").eq("id", id).maybeSingle(),
          "get payment"
        );
      },
      async create(payment, allocations, proofs = []) {
        // One transaction that also checks the allocations and proofs (0004, 0009).
        mustWrite(
          await db.rpc("create_payment", {
            p_id: payment.id,
            p_tenant_id: payment.tenant_id,
            p_amount: payment.amount,
            p_payment_date: payment.payment_date,
            p_mode: payment.mode,
            p_note: payment.note ?? null,
            p_owner_signature_path: payment.owner_signature_path,
            p_token_hash: payment.token_hash,
            p_token_expires_at: payment.token_expires_at,
            p_allocations: allocations,
            p_proofs: proofs,
          }),
          "create payment"
        );
      },
      async listAllocations(paymentId) {
        return must(
          await db.from("payment_allocations").select("*").eq("payment_id", paymentId),
          "list payment allocations"
        );
      },
      async listProofs(paymentIds) {
        const batches = await Promise.all(
          chunk(paymentIds).map(async (ids) =>
            must(
              await db.from("payment_proofs").select("*").in("payment_id", ids).order("storage_path"),
              "list payment proofs"
            )
          )
        );
        return batches.flat();
      },
      async getProof(proofId) {
        return must(
          await db.from("payment_proofs").select("*").eq("id", proofId).maybeSingle(),
          "get payment proof"
        );
      },
      async rotateToken(id, tokenHash, expiresAt) {
        // The owner's UPDATE grant covers only these two columns (0001_init.sql).
        const rows = mustWrite(
          await db
            .from("payments")
            .update({ token_hash: tokenHash, token_expires_at: expiresAt })
            
            .eq("id", id)
            .is("acknowledged_at", null)
            .select("id"),
          "rotate payment link"
        );
        return rows.length > 0;
      },
    },

    adjustments: {
      async listForTenants(tenantIds, filter = {}) {
        const batches = await Promise.all(
          chunk(tenantIds).map(async (ids) => {
            let query = db.from("adjustments").select("*").in("tenant_id", ids);
            if (filter.status) query = query.eq("status", filter.status);
            if (filter.fromDate) query = query.gte("confirmed_at", dayBefore(filter.fromDate));
            return must(await query, "list adjustments");
          })
        );
        return batches.flat();
      },
      async get(id) {
        return must(
          await db.from("adjustments").select("*").eq("id", id).maybeSingle(),
          "get adjustment"
        );
      },
      async create(adjustment, allocations) {
        mustWrite(
          await db.rpc("create_adjustment", {
            p_id: adjustment.id,
            p_original_payment_id: adjustment.original_payment_id,
            p_delta_amount: adjustment.delta_amount,
            p_reason: adjustment.reason,
            p_owner_signature_path: adjustment.owner_signature_path,
            p_token_hash: adjustment.token_hash,
            p_token_expires_at: adjustment.token_expires_at,
            p_allocations: allocations,
          }),
          "create adjustment"
        );
      },
      async listAllocations(adjustmentId) {
        return must(
          await db.from("adjustment_allocations").select("*").eq("adjustment_id", adjustmentId),
          "list adjustment allocations"
        );
      },
      async rotateToken(id, tokenHash, expiresAt) {
        const rows = mustWrite(
          await db
            .from("adjustments")
            .update({ token_hash: tokenHash, token_expires_at: expiresAt })
            
            .eq("id", id)
            .is("acknowledged_at", null)
            .select("id"),
          "rotate adjustment link"
        );
        return rows.length > 0;
      },
    },
  };
}

/** Unscoped repositories on the service-role client (bypasses RLS). */
export function supabaseSystemRepositories(): SystemRepositories {
  const db: Supabase = createAdminClient();

  return {
    audit: {
      async log(event) {
        mustWrite(
          await db.rpc("log_event", { ...logEventArgs(event), p_actor_kind: event.actorKind, p_actor_id: event.actorId ?? null }),
          "log event"
        );
      },
    },

    locations: {
      async get(locationCode) {
        return must(
          await db.from("locations").select("*").eq("location_code", locationCode).maybeSingle(),
          "get location"
        );
      },
    },

    properties: {
      async get(propertyCode) {
        return must(
          await db.from("properties").select("*").eq("property_code", propertyCode).maybeSingle(),
          "get property"
        );
      },
    },

    tenants: {
      async get(id) {
        return must(await db.from("tenants").select("*").eq("id", id).maybeSingle(), "get tenant");
      },
    },

    occupancy: {
      async listForTenant(tenantId) {
        return must(
          await db.from("unit_occupancy").select("*").eq("tenant_id", tenantId).order("start_date"),
          "list occupancy"
        );
      },
    },

    rentPeriods: {
      async listByIds(ids) {
        const batches = await Promise.all(
          chunk(ids).map(async (part) =>
            must(await db.from("rent_periods").select("*").in("id", part), "list rent periods")
          )
        );
        return batches.flat();
      },
      async ensure(tenantIds, throughMonth) {
        if (tenantIds && tenantIds.length === 0) return 0;
        return must(
          await db.rpc("ensure_rent_periods", { p_tenant_ids: tenantIds, p_through: throughMonth }),
          "ensure rent periods"
        );
      },
    },

    payments: {
      async findByTokenHash(tokenHash) {
        return must(await db.from("payments").select("*").eq("token_hash", tokenHash).maybeSingle(), "find payment");
      },
      async get(id) {
        return must(await db.from("payments").select("*").eq("id", id).maybeSingle(), "get payment");
      },
      async listAllocations(paymentId) {
        return must(
          await db.from("payment_allocations").select("*").eq("payment_id", paymentId),
          "list payment allocations"
        );
      },
      async listProofs(paymentIds) {
        if (paymentIds.length === 0) return [];
        return must(
          await db.from("payment_proofs").select("*").in("payment_id", paymentIds).order("storage_path"),
          "list payment proofs"
        );
      },
      async acknowledge(id, patch) {
        // Compare-and-swap on acknowledged_at; moves no money (0010).
        return mustWrite(
          await db.rpc("acknowledge_payment", {
            p_id: id,
            p_tenant_signature_path: patch.tenant_signature_path,
            p_pdf_path: patch.pdf_path,
            p_otp_verified_at: patch.otp_verified_at,
          }),
          "acknowledge payment"
        ) as boolean;
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
      async acknowledge(id, patch) {
        return mustWrite(
          await db.rpc("acknowledge_adjustment", {
            p_id: id,
            p_tenant_signature_path: patch.tenant_signature_path,
            p_pdf_path: patch.pdf_path,
            p_otp_verified_at: patch.otp_verified_at,
          }),
          "acknowledge adjustment"
        ) as boolean;
      },
    },

    rateLimits: {
      async hit(key, limit, windowSeconds) {
        return must(
          await db.rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
          "rate limit"
        );
      },
      async prune() {
        return must(await db.rpc("prune_rate_limits"), "prune rate limits");
      },
    },
  };
}

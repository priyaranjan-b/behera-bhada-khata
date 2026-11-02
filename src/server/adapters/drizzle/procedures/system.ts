import "server-only";
import { sql } from "drizzle-orm";
import type { AcknowledgementPatch, AuditEvent } from "@/server/ports";
import type { AuditActorKind } from "@/lib/types";
import { executeRows, type Tx } from "../client";
import { jsonb, uuidArray } from "./params";

// SQL functions that stay in Postgres and aren't the ledger or tenant
// writes (A19): rent-month upkeep (ensure_rent_periods, the system's, kept
// next to the lifecycle functions so the billing rule exists once), the
// tenant's acknowledgement
// (a compare-and-swap on acknowledged_at that moves no money, D20) and
// app events in the immutable audit log (log_event, D25). Typed calls with
// named arguments, as the Supabase adapter's rpc() makes them.

/** Creates the missing rent months through `throughMonth`; null = every active tenant. Returns how many. */
export async function ensureRentPeriods(tx: Tx, tenantIds: string[] | null, throughMonth: string): Promise<number> {
  const [row] = await executeRows<{ n: number }>(
    tx,
    sql`select ensure_rent_periods(p_tenant_ids => ${uuidArray(tenantIds)}, p_through => ${throughMonth}::date)::int as n`
  );
  return row.n;
}

/** False if it was already acknowledged (a racing acknowledgement won). */
export async function acknowledge(
  tx: Tx,
  record: "payment" | "adjustment",
  id: string,
  patch: AcknowledgementPatch
): Promise<boolean> {
  const args = sql`p_id => ${id}::uuid, p_tenant_signature_path => ${patch.tenant_signature_path}::text,
    p_pdf_path => ${patch.pdf_path}::text, p_otp_verified_at => ${patch.otp_verified_at}::timestamptz`;
  const call = record === "payment" ? sql`acknowledge_payment(${args})` : sql`acknowledge_adjustment(${args})`;
  const [row] = await executeRows<{ ok: boolean }>(tx, sql`select ${call} as ok`);
  return row.ok;
}

/**
 * One app event (receipt downloaded, sign-in...). For the owner the actor is
 * the session (auth.uid()); for the system, `actor` names who acted.
 */
export async function logEvent(
  tx: Tx,
  event: AuditEvent,
  actor?: { kind: AuditActorKind; id?: string | null }
): Promise<void> {
  await executeRows(
    tx,
    sql`select log_event(
      p_action => ${event.action}::text,
      p_tenant_id => ${event.tenantId ?? null}::uuid,
      p_entity_type => ${event.entityType ?? null}::text,
      p_entity_id => ${event.entityId ?? null}::text,
      p_context => ${jsonb(event.context ?? {})}
      ${actor ? sql`, p_actor_kind => ${actor.kind}::text, p_actor_id => ${actor.id ?? null}::uuid` : sql``}
    )`
  );
}

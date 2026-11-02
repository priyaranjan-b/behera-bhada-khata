import "server-only";
import { sql } from "drizzle-orm";
import type { NewAdjustment, NewAllocation, NewPayment, NewPaymentProof } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { jsonb } from "./params";

// The money-moving writes stay in Postgres (D4, D5, A19): create_payment and
// create_adjustment lock the months, check every invariant, insert the record
// and its allocations and move amount_allocated in one transaction, as
// SECURITY DEFINER functions, so the owner role keeps its ledger writes
// revoked. These are typed calls with named arguments, as the Supabase
// adapter's rpc() makes them; the logic is unchanged.

export async function createPayment(
  tx: Tx,
  payment: NewPayment,
  allocations: NewAllocation[],
  proofs: NewPaymentProof[] = []
): Promise<void> {
  await executeRows(
    tx,
    sql`select create_payment(
      p_id => ${payment.id}::uuid,
      p_tenant_id => ${payment.tenant_id}::uuid,
      p_amount => ${payment.amount}::numeric,
      p_payment_date => ${payment.payment_date}::date,
      p_mode => ${payment.mode}::text,
      p_note => ${payment.note ?? null}::text,
      p_owner_signature_path => ${payment.owner_signature_path}::text,
      p_token_hash => ${payment.token_hash}::text,
      p_token_expires_at => ${payment.token_expires_at}::timestamptz,
      p_allocations => ${jsonb(allocations)},
      p_proofs => ${jsonb(proofs)}
    )`
  );
}

/** The tenant is taken from the original payment. */
export async function createAdjustment(tx: Tx, adjustment: NewAdjustment, allocations: NewAllocation[]): Promise<void> {
  await executeRows(
    tx,
    sql`select create_adjustment(
      p_id => ${adjustment.id}::uuid,
      p_original_payment_id => ${adjustment.original_payment_id}::uuid,
      p_delta_amount => ${adjustment.delta_amount}::numeric,
      p_reason => ${adjustment.reason}::text,
      p_owner_signature_path => ${adjustment.owner_signature_path}::text,
      p_token_hash => ${adjustment.token_hash}::text,
      p_token_expires_at => ${adjustment.token_expires_at}::timestamptz,
      p_allocations => ${jsonb(allocations)}
    )`
  );
}

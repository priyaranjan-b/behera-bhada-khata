import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, type SQL } from "drizzle-orm";
import { utcStartOfDayBefore } from "@/lib/dates";
import type {
  Adjustment,
  AdjustmentAllocation,
  LedgerStatus,
  Payment,
  PaymentAllocation,
  PaymentProof,
  RentPeriod,
} from "@/lib/types";
import type { Tx } from "../client";
import { adjustmentAllocations, adjustments, paymentAllocations, paymentProofs, payments, rentPeriods } from "../schema";

// Plain reads of the append-only ledger (0001/0004/0009/0010/0012): rent
// months, payments, adjustments, their allocations and payment proofs. Same
// filters and order as the Supabase adapter (src/server/adapters/supabase/db.ts);
// the lists it leaves unordered stay unordered (services key them by id).
// Every write stays a SQL function (create_payment, create_adjustment, D4).
// Id lists are bound parameters in one query, not chunked (A19): Postgres
// allows 65,535 per statement, and these get a page's records or one
// record's months, a few hundred at most.

/** Oldest month first, then by tenant ((tenant, month) is unique). */
export async function listRentPeriods(
  tx: Tx,
  tenantIds: string[],
  filter: { openOnly?: boolean; openOrFrom?: string; months?: { from: string; to: string } } = {}
): Promise<RentPeriod[]> {
  if (tenantIds.length === 0) return [];
  const conditions: (SQL | undefined)[] = [inArray(rentPeriods.tenant_id, tenantIds)];
  if (filter.openOnly) conditions.push(ne(rentPeriods.status, "paid"));
  else if (filter.openOrFrom) conditions.push(or(ne(rentPeriods.status, "paid"), gte(rentPeriods.period_month, filter.openOrFrom)));
  if (filter.months) {
    conditions.push(gte(rentPeriods.period_month, filter.months.from), lte(rentPeriods.period_month, filter.months.to));
  }
  return tx
    .select()
    .from(rentPeriods)
    .where(and(...conditions))
    .orderBy(asc(rentPeriods.period_month), asc(rentPeriods.tenant_id));
}

export async function listRentPeriodsByIds(tx: Tx, ids: string[]): Promise<RentPeriod[]> {
  if (ids.length === 0) return [];
  return tx.select().from(rentPeriods).where(inArray(rentPeriods.id, ids));
}

/** `fromDate` (yyyy-MM-dd): dated on or after it. */
export async function listPayments(
  tx: Tx,
  tenantIds: string[],
  filter: { status?: LedgerStatus; fromDate?: string } = {}
): Promise<Payment[]> {
  if (tenantIds.length === 0) return [];
  return tx
    .select()
    .from(payments)
    .where(
      and(
        inArray(payments.tenant_id, tenantIds),
        filter.status ? eq(payments.status, filter.status) : undefined,
        filter.fromDate ? gte(payments.payment_date, filter.fromDate) : undefined
      )
    );
}

export async function getPayment(tx: Tx, id: string): Promise<Payment | null> {
  const [row] = await tx.select().from(payments).where(eq(payments.id, id));
  return row ?? null;
}

export function listPaymentAllocations(tx: Tx, paymentId: string): Promise<PaymentAllocation[]> {
  return tx.select().from(paymentAllocations).where(eq(paymentAllocations.payment_id, paymentId));
}

export async function listAllocationsForPeriods(tx: Tx, periodIds: string[]): Promise<PaymentAllocation[]> {
  if (periodIds.length === 0) return [];
  return tx.select().from(paymentAllocations).where(inArray(paymentAllocations.rent_period_id, periodIds));
}

/** In the order they were attached (storage paths are numbered, and unique). */
export async function listPaymentProofs(tx: Tx, paymentIds: string[]): Promise<PaymentProof[]> {
  if (paymentIds.length === 0) return [];
  return tx
    .select()
    .from(paymentProofs)
    .where(inArray(paymentProofs.payment_id, paymentIds))
    .orderBy(asc(paymentProofs.storage_path));
}

export async function getPaymentProof(tx: Tx, id: string): Promise<PaymentProof | null> {
  const [row] = await tx.select().from(paymentProofs).where(eq(paymentProofs.id, id));
  return row ?? null;
}

/**
 * `fromDate` (yyyy-MM-dd): confirmed from utcStartOfDayBefore(fromDate) on,
 * as in the Supabase adapter, so no instant of that day is missed.
 */
export async function listAdjustments(
  tx: Tx,
  tenantIds: string[],
  filter: { status?: LedgerStatus; fromDate?: string } = {}
): Promise<Adjustment[]> {
  if (tenantIds.length === 0) return [];
  return tx
    .select()
    .from(adjustments)
    .where(
      and(
        inArray(adjustments.tenant_id, tenantIds),
        filter.status ? eq(adjustments.status, filter.status) : undefined,
        filter.fromDate ? gte(adjustments.confirmed_at, utcStartOfDayBefore(filter.fromDate)) : undefined
      )
    );
}

export async function getAdjustment(tx: Tx, id: string): Promise<Adjustment | null> {
  const [row] = await tx.select().from(adjustments).where(eq(adjustments.id, id));
  return row ?? null;
}

export function listAdjustmentAllocations(tx: Tx, adjustmentId: string): Promise<AdjustmentAllocation[]> {
  return tx.select().from(adjustmentAllocations).where(eq(adjustmentAllocations.adjustment_id, adjustmentId));
}

/** The record a confirm link points at, by the hash of its token (src/server/token.ts); system only. */
export async function findPaymentByTokenHash(tx: Tx, tokenHash: string): Promise<Payment | null> {
  const [row] = await tx.select().from(payments).where(eq(payments.token_hash, tokenHash));
  return row ?? null;
}

export async function findAdjustmentByTokenHash(tx: Tx, tokenHash: string): Promise<Adjustment | null> {
  const [row] = await tx.select().from(adjustments).where(eq(adjustments.token_hash, tokenHash));
  return row ?? null;
}

/**
 * A new confirm-link token for a payment or adjustment the tenant hasn't
 * acknowledged; the owner's UPDATE grant covers only these two columns
 * (0001). False otherwise (acknowledged, or no such record for this owner).
 */
export async function rotateToken(
  tx: Tx,
  record: "payment" | "adjustment",
  id: string,
  tokenHash: string,
  expiresAt: string
): Promise<boolean> {
  const table = record === "payment" ? payments : adjustments;
  const rows = await tx
    .update(table)
    .set({ token_hash: tokenHash, token_expires_at: expiresAt })
    .where(and(eq(table.id, id), isNull(table.acknowledged_at)))
    .returning({ id: table.id });
  return rows.length > 0;
}

import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { PaymentTag } from "@/lib/types";
import { executeRows, type Tx } from "../client";
import { textArray } from "../procedures/params";
import { paymentTags, payments } from "../schema";

// Payment tags (0030, D34): the suggestions, and each payment's own copy of
// its tag names (payment_record_tags), plain owner writes under RLS
// (is_app_owner()). Renaming or removing a suggestion never touches a
// payment. Not audited, like the quick payment notes (D30).

/** Alphabetical (any case), with how many payments carry the name. */
export async function listPaymentTags(tx: Tx): Promise<(PaymentTag & { payment_count: number })[]> {
  return tx
    .select({
      id: paymentTags.id,
      name: paymentTags.name,
      created_at: paymentTags.created_at,
      updated_at: paymentTags.updated_at,
      // Spelled out: inside a subquery Drizzle would print the column as a bare "name", which is prt's.
      payment_count: sql<number>`(select count(*)::int from payment_record_tags prt where lower(prt.name) = lower(payment_tags.name))`,
    })
    .from(paymentTags)
    .orderBy(sql`lower(${paymentTags.name})`, asc(paymentTags.name));
}

/** A duplicate (any case, a unique index on lower(name)) is a 23505, so a 409. */
export async function createPaymentTag(tx: Tx, name: string): Promise<void> {
  await tx.insert(paymentTags).values({ name });
}

/** False if no such tag. Payments keep the name they have. */
export async function updatePaymentTag(tx: Tx, id: string, name: string): Promise<boolean> {
  const rows = await tx.update(paymentTags).set({ name }).where(eq(paymentTags.id, id)).returning({ id: paymentTags.id });
  return rows.length > 0;
}

/** False if no such tag. Payments keep the name they have. */
export async function removePaymentTag(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx.delete(paymentTags).where(eq(paymentTags.id, id)).returning({ id: paymentTags.id });
  return rows.length > 0;
}

/**
 * Makes `names` the payment's tags. A name it already has (any case) stays
 * as it is; a new one takes a suggestion's spelling if one matches, and joins
 * the suggestions if none does. Null if the payment doesn't exist (or isn't
 * visible); else its tags, alphabetical. Part of the caller's transaction.
 */
export async function setPaymentTags(tx: Tx, paymentId: string, names: string[]): Promise<string[] | null> {
  const [payment] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.id, paymentId));
  if (!payment) return null;
  const wanted = sql`(select lower(n) from unnest(${textArray(names)}) as n)`;
  await executeRows(
    tx,
    sql`delete from payment_record_tags
      where payment_id = ${paymentId}::uuid and lower(name) not in ${wanted}`
  );
  if (names.length > 0) {
    // Only the names new to this payment: re-saving one whose tag was removed
    // from the suggestions doesn't bring it back.
    await executeRows(
      tx,
      sql`with added as (
          select n from unnest(${textArray(names)}) as n
          where not exists (
            select 1 from payment_record_tags prt where prt.payment_id = ${paymentId}::uuid and lower(prt.name) = lower(n)
          )
        ),
        suggested as (
          insert into payment_tags (name) select n from added on conflict ((lower(name))) do nothing
        )
        insert into payment_record_tags (payment_id, name)
        select ${paymentId}::uuid, coalesce((select pt.name from payment_tags pt where lower(pt.name) = lower(a.n)), a.n)
        from added a
        on conflict do nothing`
    );
  }
  const rows = await executeRows<{ name: string }>(
    tx,
    sql`select name from payment_record_tags where payment_id = ${paymentId}::uuid order by lower(name), name`
  );
  return rows.map((r) => r.name);
}

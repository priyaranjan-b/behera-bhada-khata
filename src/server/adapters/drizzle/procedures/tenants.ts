import "server-only";
import { sql } from "drizzle-orm";
import type { NewTenant, TenantChanges } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { textArray } from "./params";

// The tenant lifecycle stays in Postgres (D7-D9, D17, D24, D26, D31, A19):
// these functions write dated history (houses, rents, rent months) on tables
// whose writes are revoked from the owner, and check under the same lock as
// the write. These are typed calls with named arguments, as the Supabase
// adapter's rpc() made them; the logic is unchanged. correct_paid_through
// and start_rent_tracking return a date: it is read with to_char as its
// yyyy-MM-dd key, as PostgREST sends it (a raw date would be a JS Date).

/** One transaction that also checks every house (0006, 0016). */
export async function createTenant(tx: Tx, input: NewTenant): Promise<{ id: string }> {
  const [row] = await executeRows<{ id: string }>(
    tx,
    sql`select create_tenant(
      p_name => ${input.name}::text,
      p_business_name => ${input.business_name}::text,
      p_phone => ${input.phone}::text,
      p_preferred_channel => ${input.preferred_channel}::text,
      p_monthly_rent => ${input.monthly_rent}::numeric,
      p_lease_start => ${input.lease_start}::date,
      p_unit_codes => ${textArray(input.unit_codes)},
      p_paid_through => ${input.paid_through}::date,
      p_deposit_amount => ${input.deposit_amount}::numeric,
      p_tenant_kind => ${input.tenant_kind}::text,
      p_rent_tracked => ${input.rent_tracked}::boolean
    ) as id`
  );
  return { id: row.id };
}

export async function updateTenant(tx: Tx, id: string, changes: TenantChanges): Promise<void> {
  await executeRows(
    tx,
    sql`select update_tenant(
      p_tenant_id => ${id}::uuid,
      p_name => ${changes.name}::text,
      p_business_name => ${changes.business_name}::text,
      p_phone => ${changes.phone}::text,
      p_preferred_channel => ${changes.preferred_channel}::text,
      p_unit_codes => ${textArray(changes.unit_codes)},
      p_units_effective => ${changes.units_effective}::date,
      p_monthly_rent => ${changes.monthly_rent}::numeric,
      p_rent_effective_month => ${changes.rent_effective_month}::date,
      p_lease_start => ${changes.lease_start}::date,
      p_paid_through => ${changes.paid_through}::date,
      p_deposit_amount => ${changes.deposit_amount}::numeric,
      p_tenant_kind => ${changes.tenant_kind}::text,
      p_rent_tracked => ${changes.rent_tracked}::boolean
    )`
  );
}

export async function moveOutTenant(tx: Tx, id: string, date: string): Promise<void> {
  await executeRows(tx, sql`select move_out_tenant(p_tenant_id => ${id}::uuid, p_move_out_date => ${date}::date)`);
}

/** The new billing start (D24). */
export async function correctPaidThrough(tx: Tx, id: string, paidThrough: string): Promise<string> {
  const [row] = await executeRows<{ v: string }>(
    tx,
    sql`select to_char(correct_paid_through(p_tenant_id => ${id}::uuid, p_paid_through => ${paidThrough}::date), 'YYYY-MM-DD') as v`
  );
  return row.v;
}

export async function correctRent(tx: Tx, id: string, fromMonth: string, monthlyRent: number): Promise<void> {
  await executeRows(
    tx,
    sql`select correct_rent(p_tenant_id => ${id}::uuid, p_from_month => ${fromMonth}::date, p_monthly_amount => ${monthlyRent}::numeric)`
  );
}

/** The billing start it sets (D26). */
export async function startRentTracking(tx: Tx, id: string, monthlyRent: number | null, paidThrough: string | null): Promise<string> {
  const [row] = await executeRows<{ v: string }>(
    tx,
    sql`select to_char(start_rent_tracking(
      p_tenant_id => ${id}::uuid, p_monthly_rent => ${monthlyRent}::numeric, p_paid_through => ${paidThrough}::date
    ), 'YYYY-MM-DD') as v`
  );
  return row.v;
}

export async function stopRentTracking(tx: Tx, id: string): Promise<void> {
  await executeRows(tx, sql`select stop_rent_tracking(p_tenant_id => ${id}::uuid)`);
}

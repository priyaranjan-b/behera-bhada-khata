import "server-only";
import { and, eq, exists, ne, notExists, sql } from "drizzle-orm";
import { currentMonthKey } from "@/lib/dates";
import type { TenantAccountSummaryDb } from "@/lib/types";
import type { Tx } from "../client";
import { adjustments, payments, rentPeriods, tenants } from "../schema";

// Replaces tenant_account_summary() (0022, D29; dropped in 0029, D33): the tenant page's account
// figures as one aggregate statement. Same rules as summarizeBalance
// (src/lib/domain/allocation.ts): a month is owed once it has ended (before
// this month in APP_TIME_ZONE), and only what is still unpaid counts; this
// month and later are "not due yet". Run under RLS, so anyone but the owner
// gets zeros and false.
//
// "This month" comes from the app server's clock (currentMonthKey), on
// purpose: the same clock summarizeBalance and the pages use, rather than
// the database clock the dropped app_current_month() read. The two can only
// disagree for seconds around midnight on the 1st (the parity test's oracle
// still reads it).

export async function tenantAccountSummary(tx: Tx, tenantId: string): Promise<TenantAccountSummaryDb> {
  const r = rentPeriods;
  const ended = sql`${r.period_month} < ${currentMonthKey()}::date`;
  const notEnded = sql`${r.period_month} >= ${currentMonthKey()}::date`;
  const unpaid = sql`${r.amount_due} > ${r.amount_allocated}`;
  const owing = sql`${r.amount_due} - ${r.amount_allocated}`;

  // The rule stop_rent_tracking enforces (0016): a current, tracked
  // government tenant with no payment, no adjustment and nothing allocated.
  const canStopRentTracking = exists(
    tx
      .select({ one: sql`1` })
      .from(tenants)
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.tenant_kind, "government"),
          eq(tenants.status, "active"),
          eq(tenants.rent_tracked, true),
          notExists(tx.select({ one: sql`1` }).from(payments).where(eq(payments.tenant_id, tenants.id))),
          notExists(tx.select({ one: sql`1` }).from(adjustments).where(eq(adjustments.tenant_id, tenants.id))),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(rentPeriods)
              .where(and(eq(rentPeriods.tenant_id, tenants.id), ne(rentPeriods.amount_allocated, 0)))
          )
        )
      )
  );

  const [row] = await tx
    .select({
      total_outstanding: sql`coalesce(sum(${owing}) filter (where ${ended} and ${unpaid}), 0)`.mapWith(Number),
      overdue_months: sql`count(*) filter (where ${ended} and ${unpaid})`.mapWith(Number),
      not_yet_due: sql`coalesce(sum(${owing}) filter (where ${notEnded} and ${unpaid}), 0)`.mapWith(Number),
      ended_months: sql`count(*) filter (where ${ended})`.mapWith(Number),
      paid_ended_months: sql`count(*) filter (where ${ended} and ${r.status} = 'paid')`.mapWith(Number),
      can_stop_rent_tracking: sql<boolean>`${canStopRentTracking}`,
    })
    .from(r)
    .where(eq(r.tenant_id, tenantId));
  return row;
}

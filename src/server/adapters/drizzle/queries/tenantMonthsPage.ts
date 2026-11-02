import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { currentMonthKey } from "@/lib/dates";
import { TENANT_MONTH_DISPLAY_STATUSES, TENANT_MONTH_SHOWS, TENANT_MONTH_SHOW_STATUSES } from "@/lib/domain/billing";
import { statusLabel } from "@/lib/domain/status";
import type { TenantMonthDbRow } from "@/lib/types";
import type { DbPage, TenantMonthsFilter } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";
import { labelOf, monthLabel } from "./text";

// Replaces tenant_months_page() (0019, A15, D28) and its tenant_month_rows /
// tenant_months_matching / period_display_status: a tenant's rent months as
// the Months table shows them, one page. A month that hasn't ended and isn't
// fully paid shows as "not due yet" (periodDisplayStatus in
// src/lib/domain/billing.ts), with "this month" from the app's clock. One
// statement, under RLS. Money comes back as JSON numbers, exact as in
// tenantLedgerPage.

const STATUS_LABELS = Object.fromEntries(TENANT_MONTH_DISPLAY_STATUSES.map((s) => [s, statusLabel(s)]));

function monthRows(tenantId: string): SQL {
  const thisMonth = currentMonthKey();
  return sql`
    select r.id, r.period_month, r.amount_due, r.amount_allocated, r.status, d.display_status,
      ${monthLabel(sql`r.period_month`)} as month_label, ${labelOf(sql`d.display_status`, STATUS_LABELS, "")} as status_label
    from rent_periods r
    cross join lateral (
      select case when r.period_month >= ${thisMonth}::date and r.status <> 'paid' then 'not_due_yet' else r.status end
        as display_status
    ) d
    where r.tenant_id = ${tenantId}::uuid`;
}

/** The Months grid over one row `r` of monthRows. A month is unique per tenant, so it is the tie-break. */
const MONTHS_TABLE: GridTable<TenantMonthsFilter["sort"], TenantMonthsFilter["filters"][number]["field"]> = {
  sorts: {
    period_month: sql`r.period_month`,
    amount_due: sql`r.amount_due`,
    amount_allocated: sql`r.amount_allocated`,
    status: sql`r.status_label`,
  },
  fields: { month: sql`r.month_label`, status: sql`r.status_label` },
  searchText: sql`r.month_label || chr(10) || r.status_label`,
  tieBreak: [sql`r.period_month desc`],
};

export async function tenantMonthsPage(tx: Tx, filter: TenantMonthsFilter): Promise<DbPage<TenantMonthDbRow>> {
  checkGrid(MONTHS_TABLE, filter);
  if (!(TENANT_MONTH_SHOWS as readonly string[]).includes(filter.show)) throw invalidQuery("show");
  const shows = TENANT_MONTH_SHOW_STATUSES[filter.show];
  const show = shows ? sql`r.display_status in (${sql.join(shows.map((s) => sql`${s}`), sql`, `)})` : sql`true`;

  const [result] = await executeRows<{ all_count: number; total: number; page: number; rows: TenantMonthDbRow[] }>(
    tx,
    sql`
      with every_row as materialized (${monthRows(filter.tenantId)}),
      matching as (select * from every_row r where ${show} and ${gridWhere(MONTHS_TABLE, filter)}),
      counted as (select count(*)::int as total from matching),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (
        select r.*, row_number() over (order by ${gridOrderBy(MONTHS_TABLE, filter)}) as n from matching r
      )
      select
        (select count(*)::int from every_row) as all_count,
        counted.total,
        shown.page,
        (select coalesce(json_agg(json_build_object(
            'id', o.id, 'period_month', o.period_month, 'amount_due', o.amount_due,
            'amount_allocated', o.amount_allocated, 'status', o.status,
            'display_status', o.display_status, 'month_label', o.month_label
          ) order by o.n), '[]'::json)
          from ordered o
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );
  return { rows: result.rows, total: result.total, all: result.all_count, page: result.page };
}

import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { APP_TIME_ZONE, currentMonthKey, isDateKey } from "@/lib/dates";
import { LEDGER_STATUS_LABELS } from "@/lib/domain/tenantLedger";
import type { TenantLedgerSumsDb, TenantLedgerDbRow } from "@/lib/types";
import type { DbPage, TenantLedgerFilter } from "@/server/ports";
import { round2 } from "@/lib/money";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";
import { dateLabel, labelOf, monthLabel, paymentTagsOf } from "./text";

// Replaces tenant_ledger_page() (0020, A15, D28) and its tenant_ledger_rows
// / tenant_ledger_matching (all dropped in 0029, D33): a tenant's rent charges, payments and
// adjustments as one journal with a running balance, one page. The rules:
//   * charge: one per rent month, dated the month, debit = amount due;
//     "upcoming" (shown, not counted) for this month and later, else "billed";
//   * payment: dated payment_date, credit = amount;
//   * adjustment: dated the APP_TIME_ZONE day it was confirmed (else
//     created); a negative delta is a debit, a positive one a credit;
//   * the balance walks the journal by date, type (adjustment, charge,
//     payment), when recorded, then id, skipping pending and upcoming rows,
//     over the tenant's whole ledger before any filter or page, so every
//     page shows the all-time balance.
// One statement, under RLS. "This month" is the app's clock (currentMonthKey).
// Money comes back as JSON numbers, as the SQL function's did: numeric sums
// are exact in Postgres and print at most two decimals, so JSON.parse gives
// the same number Number() would (paymentsPage reads text only because it
// adds the per-mode sums in JS, through round2).
// A payment row carries its tags (0030, D34), searched with the rest.
// The payment line keeps the SQL function's wording, raw mode included
// ("Payment received (bank transfer)"); changing it is a separate change.

function ledgerRows(tenantId: string): SQL {
  const thisMonth = currentMonthKey();
  return sql`
    with journal as (
      select 'charge-' || r.id as id, 'charge' as type, r.period_month as date,
        'Rent due — ' || ${monthLabel(sql`r.period_month`)} as description,
        r.amount_due as debit, 0::numeric as credit,
        case when r.period_month < ${thisMonth}::date then 'billed' else 'upcoming' end as status,
        null::uuid as ref_id, null::text as receipt_no, null::boolean as acknowledged, r.created_at as recorded_at,
        '[]'::json as tags, '' as tags_text
      from rent_periods r
      where r.tenant_id = ${tenantId}::uuid
      union all
      select 'payment-' || p.id, 'payment', p.payment_date,
        'Payment received (' || replace(p.mode, '_', ' ') || ')' || coalesce(' — ' || nullif(p.note, ''), ''),
        0, p.amount,
        case when p.status = 'confirmed' then 'confirmed' else 'pending' end,
        p.id, p.receipt_no, p.acknowledged_at is not null, p.created_at,
        tags.names, tags.text
      from payments p
      left join lateral (${paymentTagsOf(sql`p.id`)}) as tags on true
      where p.tenant_id = ${tenantId}::uuid
      union all
      select 'adjustment-' || a.id, 'adjustment', (coalesce(a.confirmed_at, a.created_at) at time zone ${APP_TIME_ZONE})::date,
        'Adjustment — ' || a.reason,
        case when a.delta_amount < 0 then -a.delta_amount else 0 end,
        case when a.delta_amount > 0 then a.delta_amount else 0 end,
        case when a.status = 'confirmed' then 'confirmed' else 'pending' end,
        a.id, a.receipt_no, a.acknowledged_at is not null, a.created_at,
        '[]'::json, ''
      from adjustments a
      where a.tenant_id = ${tenantId}::uuid
    ),
    ordered as (
      select j.*, row_number() over (order by j.date, j.type, j.recorded_at, j.id) as ord from journal j
    )
    select o.id, o.type, o.date, o.description,
      case
        when o.type = 'charge' then 'Charge'
        else coalesce('#' || o.receipt_no, initcap(o.type))
          || ' · ' || case when o.acknowledged then 'signed by tenant' else 'not signed by tenant' end
      end as caption,
      o.debit, o.credit,
      sum(case when o.status in ('pending', 'upcoming') then 0 else o.debit - o.credit end) over (order by o.ord) as balance,
      o.status, ${labelOf(sql`o.status`, LEDGER_STATUS_LABELS, "")} as status_label,
      ${dateLabel(sql`o.date`)} as date_label,
      o.ref_id, o.receipt_no, o.acknowledged, o.tags, o.tags_text, o.ord
    from ordered o`;
}

const NL = sql`chr(10)`;

/** The Ledger grid over one row `r` of ledgerRows. "Date" sorts by journal order. */
const LEDGER_TABLE: GridTable<TenantLedgerFilter["sort"], TenantLedgerFilter["filters"][number]["field"]> = {
  sorts: {
    date: sql`r.ord`,
    description: sql`lower(r.description)`,
    status: sql`r.status_label`,
    debit: sql`r.debit`,
    credit: sql`r.credit`,
    balance: sql`r.balance`,
  },
  fields: {
    date: sql`r.date_label`,
    description: sql`r.description || ${NL} || r.caption`,
    status: sql`r.status_label`,
  },
  searchText: sql`concat_ws(${NL}, r.date_label, r.description, r.caption, r.status_label, r.tags_text)`,
  tieBreak: [sql`r.ord desc`],
};

/** What the statement returns; the sums as text so no float rounding happens before round2. */
interface PageResult {
  all_count: number;
  total: number;
  page: number;
  rows: TenantLedgerDbRow[];
  debit: string;
  credit: string;
}

export async function tenantLedgerPage(
  tx: Tx,
  filter: TenantLedgerFilter
): Promise<DbPage<TenantLedgerDbRow> & { sums: TenantLedgerSumsDb }> {
  checkGrid(LEDGER_TABLE, filter);
  for (const day of [filter.fromDate, filter.toDate]) {
    if (day !== undefined && !isDateKey(day)) throw invalidQuery("date range");
  }
  const dates = [
    filter.fromDate ? sql`r.date >= ${filter.fromDate}::date` : sql`true`,
    filter.toDate ? sql`r.date <= ${filter.toDate}::date` : sql`true`,
    // "Credits only": the balance is still the all-time one, computed before this.
    filter.creditsOnly ? sql`r.credit > 0` : sql`true`,
  ];

  const [result] = await executeRows<PageResult>(
    tx,
    sql`
      with every_row as materialized (${ledgerRows(filter.tenantId)}),
      matching as (select * from every_row r where ${sql.join(dates, sql` and `)} and ${gridWhere(LEDGER_TABLE, filter)}),
      -- The money columns over every matching row, whatever the page (A26); as text, for round2.
      counted as (
        select count(*)::int as total,
          coalesce(sum(r.debit), 0)::text as debit,
          coalesce(sum(r.credit), 0)::text as credit
        from matching r
      ),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (
        select r.*, row_number() over (order by ${gridOrderBy(LEDGER_TABLE, filter)}) as n from matching r
      )
      select
        (select count(*)::int from every_row) as all_count,
        counted.total,
        counted.debit,
        counted.credit,
        shown.page,
        (select coalesce(json_agg(json_build_object(
            'id', o.id, 'type', o.type, 'date', o.date, 'description', o.description, 'caption', o.caption,
            'debit', o.debit, 'credit', o.credit, 'balance', o.balance, 'status', o.status,
            'ref_id', o.ref_id, 'receipt_no', o.receipt_no, 'acknowledged', o.acknowledged, 'tags', o.tags
          ) order by o.n), '[]'::json)
          from ordered o
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );
  return {
    rows: result.rows,
    total: result.total,
    all: result.all_count,
    page: result.page,
    sums: {
      debit: round2(Number(result.debit)),
      credit: round2(Number(result.credit)),
    },
  };
}

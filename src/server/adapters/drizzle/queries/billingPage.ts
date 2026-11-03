import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { addMonthsToKey, isDateKey, monthKeyOf, todayKey } from "@/lib/dates";
import {
  BILLING_DISPLAY_STATUSES,
  BILLING_SHOWS,
  BILLING_SHOW_STATUSES,
  BILLING_STATUS_RANK,
  PAID_DIRECT_PREFIX,
  PAID_DIRECT_TEXT,
  RENT_LOOKAHEAD_MONTHS,
} from "@/lib/domain/billing";
import { statusLabel } from "@/lib/domain/status";
import { NOT_SET } from "@/lib/domain/tenant";
import type { BillingDbRow, BillingTotalsDb } from "@/lib/types";
import type { BillingFilter, DbPage } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";
import { dateLabel, labelOf, monthLabel, tenantDisplayName, towersNow, unitCodesNow } from "./text";

// Replaces billing_page() and billing_totals() (0021, A15, D28) and their
// billing_rows / billing_matching / period_display_status / status_label
// (all dropped in 0029, D33):
// a row is one tenant's rent for one month in the range, plus (when shown)
// government rent paid to the owner directly (A11), computed and never
// stored as paidDirectMonths does (src/lib/domain/billing.ts). Runs under
// RLS, so anyone but the owner gets nothing. Each call is one statement.
//
// "Today", "this month" and the horizon come from one read of the app's
// clock (todayKey), as the pages use, not the database's (the dropped
// app_current_month() used that); the parity tests rely on the two agreeing,
// which they do but for the moment either side of midnight in APP_TIME_ZONE.

/** Labels from statusLabel, as the grid shows them. */
const STATUS_LABELS = Object.fromEntries(BILLING_DISPLAY_STATUSES.map((s) => [s, statusLabel(s)]));
/** As text, for labelOf; cast back to int in SQL. */
const STATUS_RANK = Object.fromEntries(Object.entries(BILLING_STATUS_RANK).map(([s, rank]) => [s, String(rank)]));

/** One read of the app's clock for a whole statement. */
function readClock() {
  const today = todayKey();
  const thisMonth = monthKeyOf(today);
  return { today, thisMonth, horizon: addMonthsToKey(thisMonth, RENT_LOOKAHEAD_MONTHS) };
}
type Clock = ReturnType<typeof readClock>;

/**
 * The range's months: stored rent months, plus paid-direct months when
 * `paidDirect`, from the lease month (or the range's start) to the move-out
 * month or the horizon, at the rent in effect (before the first rate, the
 * first rate). `period_id` is the rent month's uuid, null for paid-direct.
 */
function billingMonths(from: string, to: string, paidDirect: boolean, clock: Clock): SQL {
  return sql`
    select r.id::text as id, r.id as period_id, r.tenant_id, r.period_month, r.amount_due, r.amount_allocated, r.status,
      false as paid_direct
    from rent_periods r
    where r.period_month between ${from}::date and ${to}::date
    union all
    select ${PAID_DIRECT_PREFIX}::text || t.id || ':' || to_char(m.month, 'YYYY-MM-DD'), null::uuid, t.id, m.month::date,
      rate.amount, rate.amount, 'paid', true
    from tenants t
    cross join lateral generate_series(
      greatest(${from}::date, date_trunc('month', t.lease_start)::date),
      least(${to}::date, coalesce(date_trunc('month', t.moved_out_on)::date, ${clock.horizon}::date), ${clock.horizon}::date),
      interval '1 month'
    ) as m(month)
    cross join lateral (
      select coalesce(
        (select rr.monthly_amount from tenant_rent_rates rr
         where rr.tenant_id = t.id and rr.effective_month <= m.month::date
         order by rr.effective_month desc limit 1),
        (select rr.monthly_amount from tenant_rent_rates rr where rr.tenant_id = t.id order by rr.effective_month limit 1)
      ) as amount
    ) as rate
    where ${paidDirect} and not t.rent_tracked and t.status <> 'draft' and t.lease_start is not null and rate.amount > 0`;
}

/** Every Billing row of the range, with what the grid shows and searches. */
function billingRows(from: string, to: string, paidDirect: boolean): SQL {
  const clock = readClock();
  return sql`
    with months as (${billingMonths(from, to, paidDirect, clock)}),
    -- Each tenant's houses once, not once per month.
    places as (
      select x.tenant_id, ${towersNow(sql`x.tenant_id`, clock.today)} as property_name,
        ${unitCodesNow(sql`x.tenant_id`, clock.today)} as unit_codes
      from (select distinct tenant_id from months) x
    )
    select m.id, m.tenant_id, ${tenantDisplayName(sql`t.business_name`, sql`t.name`)} as tenant_name,
      pl.property_name, pl.unit_codes,
      m.period_month, ${monthLabel(sql`m.period_month`)} as month_label, m.amount_due, m.amount_allocated,
      greatest(0, m.amount_due - m.amount_allocated) as balance,
      m.status, m.period_month >= ${clock.thisMonth}::date as not_yet_due, m.paid_direct,
      d.display_status, ${labelOf(sql`d.display_status`, STATUS_LABELS, "")} as status_label,
      ${labelOf(sql`d.display_status`, STATUS_RANK, "0")}::int as status_rank,
      coalesce(pay.list, '[]'::json) as payments,
      case when m.paid_direct then ${PAID_DIRECT_TEXT} else coalesce(pay.text, '') end as receipt_text
    from months m
    left join tenants t on t.id = m.tenant_id
    left join places pl on pl.tenant_id = m.tenant_id
    -- periodDisplayStatus, or paid direct.
    cross join lateral (
      select case
        when m.paid_direct then 'paid_direct'
        when m.period_month >= ${clock.thisMonth}::date and m.status <> 'paid' then 'not_due_yet'
        else m.status
      end as display_status
    ) as d
    -- "Paid by": the confirmed payments allocated to the month, oldest first.
    left join lateral (
      select
        json_agg(
          json_build_object('payment_id', p.id, 'receipt_no', p.receipt_no, 'payment_date', p.payment_date,
            'mode', p.mode, 'amount', pa.amount_allocated)
          order by p.payment_date, p.id
        ) as list,
        string_agg(coalesce(p.receipt_no, ${NOT_SET}) || ' (' || ${dateLabel(sql`p.payment_date`)} || ')', ', '
          order by p.payment_date, p.id) as text
      from payment_allocations pa
      join payments p on p.id = pa.payment_id and p.status = 'confirmed'
      where pa.rent_period_id = m.period_id
    ) as pay on true`;
}

const NL = sql`chr(10)`;

/** The Billing grid over one row `r` of billingRows. */
const BILLING_TABLE: GridTable<BillingFilter["sort"], BillingFilter["filters"][number]["field"]> = {
  sorts: {
    period_month: sql`r.period_month`,
    tenant_name: sql`lower(r.tenant_name)`,
    amount_due: sql`r.amount_due`,
    amount_allocated: sql`r.amount_allocated`,
    balance: sql`r.balance`,
    status: [sql`r.status_rank`, sql`r.balance`],
  },
  fields: {
    month: sql`r.month_label`,
    tenant: sql`r.tenant_name || ${NL} || r.property_name`,
    status: sql`r.status_label`,
    payments: sql`r.receipt_text`,
  },
  searchText: sql`concat_ws(${NL}, r.month_label, r.tenant_name, r.property_name, r.status_label, r.receipt_text)`,
  tieBreak: [sql`r.period_month desc`, sql`lower(r.tenant_name)`, sql`r.id`],
};

/** Month keys, both included, the first not after the last. */
function checkRange(from: string, to: string): void {
  if (!isDateKey(from) || !isDateKey(to) || from > to) throw invalidQuery("month range");
}

export async function billingPage(tx: Tx, filter: BillingFilter): Promise<DbPage<BillingDbRow>> {
  checkGrid(BILLING_TABLE, filter);
  if (!(BILLING_SHOWS as readonly string[]).includes(filter.show)) throw invalidQuery("show");
  checkRange(filter.from, filter.to);
  const shows = BILLING_SHOW_STATUSES[filter.show];
  const show = shows ? sql`r.display_status in (${sql.join(shows.map((s) => sql`${s}`), sql`, `)})` : sql`true`;

  const [result] = await executeRows<{ all_count: number; total: number; page: number; rows: BillingDbRow[] }>(
    tx,
    sql`
      with every_row as materialized (${billingRows(filter.from, filter.to, filter.paidDirect)}),
      matching as (select * from every_row r where ${show} and ${gridWhere(BILLING_TABLE, filter)}),
      counted as (select count(*)::int as total from matching),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (
        select r.*, row_number() over (order by ${gridOrderBy(BILLING_TABLE, filter)}) as n from matching r
      )
      select
        (select count(*)::int from every_row) as all_count,
        counted.total,
        shown.page,
        (select coalesce(json_agg(json_build_object(
            'id', o.id, 'tenant_id', o.tenant_id, 'tenant_name', o.tenant_name, 'property_name', o.property_name,
            'unit_codes', to_json(o.unit_codes), 'period_month', o.period_month, 'month_label', o.month_label,
            'amount_due', o.amount_due, 'amount_allocated', o.amount_allocated, 'balance', o.balance,
            'status', o.status, 'not_yet_due', o.not_yet_due, 'paid_direct', o.paid_direct, 'payments', o.payments
          ) order by o.n), '[]'::json)
          from ordered o
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );
  return { rows: result.rows, total: result.total, all: result.all_count, page: result.page };
}

/** The range's stat cards over every row, whatever the page, "Show" or search (billingTotals in src/lib/domain/billing.ts). */
export async function billingTotals(tx: Tx, range: { from: string; to: string; paidDirect: boolean }): Promise<BillingTotalsDb> {
  checkRange(range.from, range.to);
  const clock = readClock();
  const [result] = await executeRows<{ totals: BillingTotalsDb }>(
    tx,
    sql`
      select json_build_object(
        'billed', coalesce(sum(b.amount_due), 0),
        'collected', coalesce(sum(b.amount_allocated), 0),
        'balance', greatest(0, coalesce(sum(b.amount_due), 0) - coalesce(sum(b.amount_allocated), 0)),
        'overdue', coalesce(sum(greatest(0, b.amount_due - b.amount_allocated)) filter (where b.period_month < ${clock.thisMonth}::date), 0),
        'collection_rate', case when coalesce(sum(b.amount_due), 0) > 0
          then round(sum(b.amount_allocated) / sum(b.amount_due) * 100)::int end,
        'tenants', count(distinct b.tenant_id)
      ) as totals
      -- Just the months: the totals need no houses, labels or payments.
      from (${billingMonths(range.from, range.to, range.paidDirect, clock)}) b`
  );
  return result.totals;
}

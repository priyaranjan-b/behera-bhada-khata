import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { daysBetween, isDateKey, todayKey } from "@/lib/dates";
import { PAYMENT_MODE_LABELS, isPaymentMode } from "@/lib/domain/payments";
import { round2 } from "@/lib/money";
import { PAYMENT_MODES, type PaymentMode, type PaymentsDbRow, type PaymentsTotalsDb } from "@/lib/types";
import { PAYMENTS_LIMITS } from "@/lib/validation";
import type { DbPage, PaymentsFilter } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";
import { dateLabel, labelOf, monthLabel, paymentTagsOf, tenantDisplayName, towersNow } from "./text";

// Replaces payments_page() (0026, A18), plus each payment's tags (0030, D34,
// searched and filtered like the rest of the text) and its payments_rows /
// payments_matching / payment_mode_label (all dropped in 0029, D33): every tenant's confirmed payments
// by the day received, one page, with the money per mode of every row that
// passes the search and filters (the stat cards follow the table). Runs
// under RLS, so anyone but the owner gets nothing.
//
// One statement, as the SQL function was: the count, the cards and the page
// all read one snapshot under one statement_timeout, in one round trip.

/** One row per confirmed payment received in the days, with the text the table shows. */
function paymentRows(from: string, to: string): SQL {
  return sql`
    select p.id, p.receipt_no, p.payment_date, ${dateLabel(sql`p.payment_date`)} as date_label, p.tenant_id,
      ${tenantDisplayName(sql`t.business_name`, sql`t.name`)} as tenant_name,
      ${towersNow(sql`p.tenant_id`, todayKey())} as property_name,
      p.mode, ${labelOf(sql`p.mode`, PAYMENT_MODE_LABELS, PAYMENT_MODE_LABELS.other)} as mode_label,
      p.amount, coalesce(months.text, '') as months_text, coalesce(p.note, '') as note,
      p.acknowledged_at is not null as acknowledged, tags.names as tags, tags.text as tags_text
    from payments p
    left join tenants t on t.id = p.tenant_id
    left join lateral (
      select string_agg(${monthLabel(sql`r.period_month`)}, ', ' order by r.period_month) as text
      from payment_allocations pa
      join rent_periods r on r.id = pa.rent_period_id
      where pa.payment_id = p.id
    ) as months on true
    left join lateral (${paymentTagsOf(sql`p.id`)}) as tags on true
    where p.status = 'confirmed' and p.payment_date between ${from}::date and ${to}::date`;
}

const NL = sql`chr(10)`;

/** The Payments grid over one row `r` of paymentRows. */
const PAYMENTS_TABLE: GridTable<PaymentsFilter["sort"], PaymentsFilter["filters"][number]["field"]> = {
  sorts: {
    payment_date: sql`r.payment_date`,
    receipt_no: sql`r.receipt_no`,
    tenant_name: sql`lower(r.tenant_name)`,
    mode: sql`r.mode_label`,
    amount: sql`r.amount`,
  },
  fields: {
    date: sql`r.date_label`,
    receipt: sql`coalesce(r.receipt_no, '')`,
    tenant: sql`r.tenant_name || ${NL} || r.property_name`,
    mode: sql`r.mode_label`,
    months: sql`r.months_text`,
    note: sql`r.note`,
    // Name by name, not the joined text: "equals Padma" finds a payment tagged Malati and Padma, and no
    // filter matches across the ", " between two names.
    tags: { text: sql`r.tags_text`, values: sql`json_array_elements_text(r.tags)` },
  },
  searchText: sql`concat_ws(${NL}, r.date_label, r.receipt_no, r.tenant_name, r.property_name, r.mode_label, r.months_text, r.note, r.tags_text)`,
  tieBreak: [sql`r.payment_date desc`, sql`r.receipt_no desc`, sql`r.id`],
};

/** What the statement returns; money as text so no float rounding happens before round2. */
interface PageResult {
  all_count: number;
  total: number;
  page: number;
  by_mode: { mode: string; amount: string; count: number }[];
  rows: (Omit<PaymentsDbRow, "amount"> & { amount: string })[];
}

export async function paymentsPage(
  tx: Tx,
  filter: PaymentsFilter
): Promise<DbPage<PaymentsDbRow> & { totals: PaymentsTotalsDb }> {
  checkGrid(PAYMENTS_TABLE, filter);
  const { from, to } = filter;
  // maxDays counts both ends (731 = two years), daysBetween doesn't.
  if (!isDateKey(from) || !isDateKey(to) || from > to || daysBetween(from, to) >= PAYMENTS_LIMITS.maxDays) {
    throw invalidQuery("date range");
  }

  const [result] = await executeRows<PageResult>(
    tx,
    sql`
      with matching as materialized (
        select * from (${paymentRows(from, to)}) r where ${gridWhere(PAYMENTS_TABLE, filter)}
      ),
      counted as (select count(*)::int as total from matching),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (
        select r.*, row_number() over (order by ${gridOrderBy(PAYMENTS_TABLE, filter)}) as n from matching r
      )
      select
        (select count(*)::int from payments p
          where p.status = 'confirmed' and p.payment_date between ${from}::date and ${to}::date) as all_count,
        counted.total,
        shown.page,
        (select coalesce(json_agg(json_build_object('mode', m.mode, 'amount', m.amount::text, 'count', m.count)), '[]'::json)
          from (select mode, sum(amount) as amount, count(*)::int as count from matching group by mode) m) as by_mode,
        (select coalesce(json_agg(json_build_object(
            'id', o.id, 'receipt_no', o.receipt_no, 'payment_date', to_char(o.payment_date, 'YYYY-MM-DD'),
            'tenant_id', o.tenant_id, 'tenant_name', o.tenant_name, 'property_name', o.property_name,
            'mode', o.mode, 'amount', o.amount::text, 'months_text', o.months_text, 'note', o.note,
            'acknowledged', o.acknowledged, 'tags', o.tags
          ) order by o.n), '[]'::json)
          from ordered o
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );

  const totals: PaymentsTotalsDb = {
    amount: 0,
    count: 0,
    by_mode: Object.fromEntries(PAYMENT_MODES.map((mode) => [mode, 0])) as Record<PaymentMode, number>,
  };
  for (const m of result.by_mode) {
    // The table's CHECK allows only the app's modes; Other, as payment_mode_label, just in case.
    const mode: PaymentMode = isPaymentMode(m.mode) ? m.mode : "other";
    totals.by_mode[mode] = round2(totals.by_mode[mode] + Number(m.amount));
    totals.amount = round2(totals.amount + Number(m.amount));
    totals.count += m.count;
  }

  return {
    rows: result.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    total: result.total,
    all: result.all_count,
    page: result.page,
    totals,
  };
}

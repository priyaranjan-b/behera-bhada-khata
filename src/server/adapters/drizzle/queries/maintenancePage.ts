import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { daysBetween, isDateKey } from "@/lib/dates";
import { MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS, isMaintenanceCategory } from "@/lib/domain/maintenance";
import { round2 } from "@/lib/money";
import type { MaintenanceDbRow, MaintenanceTotalsDb } from "@/lib/types";
import { MAINTENANCE_LIMITS } from "@/lib/validation";
import type { DbPage, MaintenanceFilter } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";
import { dateLabel, labelOf, maintenanceTagsOf } from "./text";

// The Maintenance page (0031, D35): every expense spent in the days, voided
// ones included (so a void is visible), one page, with the totals of every
// matching expense that isn't voided (the stat cards follow the table, as on
// the Payments page, A18). One statement under RLS.

/** One row per expense spent in the days, with the text the table shows. */
function expenseRows(from: string, to: string): SQL {
  return sql`
    select e.id, e.expense_date, ${dateLabel(sql`e.expense_date`)} as date_label, e.amount,
      e.category, ${labelOf(sql`e.category`, MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_CATEGORY_LABELS.other)} as category_label,
      e.description, e.vendor, e.note, e.voided_at is not null as voided,
      e.settled_by_payment_id is not null as settled_by_set_off,
      case when e.voided_at is null then ${MAINTENANCE_STATUS_LABELS.counted} else ${MAINTENANCE_STATUS_LABELS.voided} end as status_label,
      houses.codes as unit_codes, houses.text as units_text,
      tags.names as tags, tags.text as tags_text,
      (select count(*)::int from maintenance_files f where f.expense_id = e.id) as file_count
    from maintenance_expenses e
    left join lateral (
      select coalesce(json_agg(mu.unit_code order by mu.unit_code), '[]'::json) as codes,
        coalesce(string_agg(mu.unit_code, ', ' order by mu.unit_code), '') as text
      from maintenance_expense_units mu
      where mu.expense_id = e.id
    ) as houses on true
    left join lateral (${maintenanceTagsOf(sql`e.id`)}) as tags on true
    where e.expense_date between ${from}::date and ${to}::date`;
}

const NL = sql`chr(10)`;

/** The Maintenance grid over one row `r` of expenseRows. */
const MAINTENANCE_TABLE: GridTable<MaintenanceFilter["sort"], MaintenanceFilter["filters"][number]["field"]> = {
  sorts: {
    expense_date: sql`r.expense_date`,
    description: sql`lower(r.description)`,
    category: sql`r.category_label`,
    amount: sql`r.amount`,
    units_text: sql`r.units_text`,
  },
  fields: {
    date: sql`r.date_label`,
    description: sql`r.description`,
    category: sql`r.category_label`,
    units: sql`r.units_text`,
    vendor: sql`coalesce(r.vendor, '')`,
    note: sql`coalesce(r.note, '')`,
    tags: { text: sql`r.tags_text`, values: sql`json_array_elements_text(r.tags)` },
    status: sql`r.status_label`,
  },
  searchText: sql`concat_ws(${NL}, r.date_label, r.description, r.category_label, r.units_text, r.vendor, r.note, r.tags_text)`,
  tieBreak: [sql`r.expense_date desc`, sql`r.id`],
};

/** What the statement returns; money as text so no float rounding happens before round2. */
interface PageResult {
  all_count: number;
  total: number;
  page: number;
  amount: string | null;
  cash_amount: string | null;
  count: number;
  by_category: { category: string; amount: string }[];
  by_tag: { name: string; amount: string }[];
  untagged: string | null;
  rows: (Omit<MaintenanceDbRow, "amount"> & { amount: string })[];
}

export async function maintenancePage(
  tx: Tx,
  filter: MaintenanceFilter
): Promise<DbPage<MaintenanceDbRow> & { totals: MaintenanceTotalsDb }> {
  checkGrid(MAINTENANCE_TABLE, filter);
  const { from, to } = filter;
  // maxDays counts both ends (731 = two years), daysBetween doesn't.
  if (!isDateKey(from) || !isDateKey(to) || from > to || daysBetween(from, to) >= MAINTENANCE_LIMITS.maxDays) {
    throw invalidQuery("date range");
  }

  const [result] = await executeRows<PageResult>(
    tx,
    sql`
      with matching as materialized (
        select * from (${expenseRows(from, to)}) r where ${gridWhere(MAINTENANCE_TABLE, filter)}
      ),
      counted as (select count(*)::int as total from matching),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (
        select r.*, row_number() over (order by ${gridOrderBy(MAINTENANCE_TABLE, filter)}) as n from matching r
      ),
      spent as (select * from matching where not voided)
      select
        (select count(*)::int from maintenance_expenses e where e.expense_date between ${from}::date and ${to}::date) as all_count,
        counted.total,
        shown.page,
        (select sum(amount)::text from spent) as amount,
        -- Cash out: a set-off paid the rest, and no money left for it (A22, isCashExpense).
        (select sum(amount)::text from spent where not settled_by_set_off) as cash_amount,
        (select count(*)::int from spent) as count,
        (select coalesce(json_agg(json_build_object('category', c.category, 'amount', c.amount::text)), '[]'::json)
          from (select category, sum(amount) as amount from spent group by category) c) as by_category,
        (select coalesce(json_agg(json_build_object('name', t.name, 'amount', t.amount::text) order by t.amount desc, t.name), '[]'::json)
          from (select n.name, sum(s.amount) as amount from spent s cross join lateral json_array_elements_text(s.tags) as n(name) group by n.name) t
        ) as by_tag,
        (select sum(amount)::text from spent where json_array_length(tags) = 0) as untagged,
        (select coalesce(json_agg(json_build_object(
            'id', o.id, 'expense_date', to_char(o.expense_date, 'YYYY-MM-DD'), 'amount', o.amount::text,
            'category', o.category, 'description', o.description, 'vendor', o.vendor, 'note', o.note,
            'voided', o.voided, 'unit_codes', o.unit_codes, 'tags', o.tags, 'file_count', o.file_count
          ) order by o.n), '[]'::json)
          from ordered o
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );

  const byCategory: MaintenanceTotalsDb["by_category"] = {};
  for (const c of result.by_category) {
    // The table's CHECK allows only the app's categories; Other, just in case.
    const category = isMaintenanceCategory(c.category) ? c.category : "other";
    byCategory[category] = round2((byCategory[category] ?? 0) + Number(c.amount));
  }

  return {
    rows: result.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    total: result.total,
    all: result.all_count,
    page: result.page,
    totals: {
      amount: round2(Number(result.amount ?? 0)),
      cash: round2(Number(result.cash_amount ?? 0)),
      count: result.count,
      by_category: byCategory,
      by_tag: result.by_tag.map((t) => ({ name: t.name, amount: round2(Number(t.amount)) })),
      untagged: round2(Number(result.untagged ?? 0)),
    },
  };
}

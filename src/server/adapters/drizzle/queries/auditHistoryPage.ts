import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { APP_TIME_ZONE, isDateKey } from "@/lib/dates";
import type { AuditLogEntry } from "@/lib/types";
import type { AuditHistoryFilter, AuditHistoryPage } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { checkGrid, gridOrderBy, gridPageNumber, gridWhere, invalidQuery, type GridTable } from "../grid";

// Replaces audit_history_page() (0018, A14) and its audit_matches /
// audit_field / audit_text_matches (all dropped in 0029, D33): one page of the audit log, the whole
// log (Activity) or one tenant's (Change history), with the stored text
// (D27) as written; nothing is rebuilt. The tenant's name is read from
// tenants, so it is the current one. Days are APP_TIME_ZONE days. One
// statement, under RLS.

const NL = sql`chr(10)`;

/** The history grid over one row `r`: an audit_log row plus its tenant's name. */
const HISTORY_TABLE: GridTable<AuditHistoryFilter["sort"], AuditHistoryFilter["filters"][number]["field"]> = {
  sorts: {
    // Never read: "at" sorts by id (see auditHistoryPage); the key is here so it's an allowed sort.
    at: sql`null::text`,
    actor_name: sql`lower(r.actor_name)`,
    title: sql`lower(r.title)`,
    tenant_name: sql`lower(r.tenant_name)`,
    unit_code: sql`lower(r.unit_code)`,
  },
  fields: {
    actor_name: sql`r.actor_name`,
    title: sql`r.title`,
    tenant_name: sql`r.tenant_name`,
    unit_code: sql`r.unit_code`,
    details: sql`r.details`,
  },
  searchText: sql`concat_ws(${NL}, r.actor_name, r.title, r.tenant_name, r.unit_code, r.details)`,
  tieBreak: [],
  noun: "history",
  nullsLast: true,
};

export async function auditHistoryPage(tx: Tx, filter: AuditHistoryFilter): Promise<AuditHistoryPage> {
  checkGrid(HISTORY_TABLE, filter);
  for (const day of [filter.fromDate, filter.toDate]) {
    if (day !== undefined && !isDateKey(day)) throw invalidQuery("date range", "history");
  }
  const day = sql`(r.at at time zone ${APP_TIME_ZONE})::date`;
  // One tenant's history, or (no id at all) the whole log. A bad id fails at ::uuid, never widens to everything.
  const tenantScope = (column: SQL) => (filter.tenantId !== undefined ? sql`${column} = ${filter.tenantId}::uuid` : sql`true`);
  const conditions = [
    // No actions at all matches nothing, as `action = any('{}')` did.
    filter.actions === undefined
      ? sql`true`
      : filter.actions.length === 0
        ? sql`false`
        : sql`r.action in (${sql.join(filter.actions.map((a) => sql`${a}`), sql`, `)})`,
    filter.fromDate ? sql`${day} >= ${filter.fromDate}::date` : sql`true`,
    filter.toDate ? sql`${day} <= ${filter.toDate}::date` : sql`true`,
  ];
  // "Newest first" is the id; after a text sort, newest first breaks ties.
  const order =
    filter.sort === "at"
      ? filter.dir === "asc"
        ? sql`r.id asc`
        : sql`r.id desc`
      : sql`${gridOrderBy(HISTORY_TABLE, filter)}, r.id desc`;

  const [result] = await executeRows<{ all_count: number; total: number; page: number; rows: AuditLogEntry[] }>(
    tx,
    sql`
      -- Only what is searched, filtered and sorted; the page's rows are read whole by id at the end.
      with named as (
        select a.id, a.at, a.action, a.actor_name, a.title, a.unit_code, a.details,
          coalesce(nullif(t.business_name, ''), t.name) as tenant_name
        from audit_log a
        left join tenants t on t.id = a.tenant_id
        where ${tenantScope(sql`a.tenant_id`)}
      ),
      matching as materialized (
        select * from named r where ${sql.join(conditions, sql` and `)} and ${gridWhere(HISTORY_TABLE, filter)}
      ),
      counted as (select count(*)::int as total from matching),
      shown as (select ${gridPageNumber(sql`counted.total`, filter)} as page from counted),
      ordered as (select r.id, row_number() over (order by ${order}) as n from matching r)
      select
        (select count(*)::int from audit_log a where ${tenantScope(sql`a.tenant_id`)}) as all_count,
        counted.total,
        shown.page,
        (select coalesce(json_agg(to_json(a) order by o.n), '[]'::json)
          from ordered o join audit_log a on a.id = o.id
          where o.n > shown.page * ${filter.pageSize} and o.n <= (shown.page + 1) * ${filter.pageSize}) as rows
      from counted, shown`
  );
  return { rows: result.rows, total: result.total, all: result.all_count, page: result.page };
}

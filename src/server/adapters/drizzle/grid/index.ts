import "server-only";
import { sql, type SQL } from "drizzle-orm";
import {
  FILTER_LOGICS,
  GRID_OPERATORS,
  SORT_DIRECTIONS,
  type FilterLogic,
  type GridFilterValue,
  type GridOperator,
  type SortDirection,
} from "@/lib/domain/gridQuery";
import { ApiError } from "@/lib/errors";
import { GRID_LIMITS } from "@/lib/validation";

// The server-paged tables' search, filters, sort and page (A15, D28): the
// TypeScript twin of the SQL grid helpers in 0019 (grid_words, grid_check,
// grid_active_filters, grid_row_matches) and like_escape /
// audit_text_matches (0017), which it replaced; 0029 dropped them (D33), and
// the names below point at their frozen copy in
// supabase/rollback/0029_restore_replaced_functions.sql. A query describes its table
// as SQL expressions over one row (`fields` for the filters, `searchText`
// for the search box, `sorts`); this builds the where and order by from the
// user's choices. Every value is a bound parameter; sort and field names
// only index into those maps, so a name the table doesn't offer is refused.
// The dropdown operators (is, not, isAnyOf) came after 0029 and have no SQL
// twin.

export interface GridFilter<F extends string> {
  field: F;
  operator: GridOperator;
  value?: GridFilterValue;
}

export interface GridQuery<S extends string, F extends string> {
  search?: string;
  filters: GridFilter<F>[];
  logic: FilterLogic;
  sort: S;
  dir: SortDirection;
  page: number;
  pageSize: number;
}

/**
 * A column that shows several values (a payment's tags): `text` is what it
 * shows ("Malati, Padma"), `values` a set-returning expression of the values
 * themselves. A filter with a value matches when one value does, so "equals
 * Padma" finds a payment tagged Malati and Padma, and "contains Padma" is
 * tested name by name; "is not Padma" means no value is Padma, and "is
 * empty" / "is not empty" test the whole list.
 */
export interface GridListField {
  text: SQL;
  values: SQL;
}

export interface GridTable<S extends string, F extends string> {
  /** Each sortable column's expression, or expressions sorted one after another in the same direction. */
  sorts: Record<S, SQL | SQL[]>;
  /** The text each filterable column shows (never null), or a list column's text and values. */
  fields: Record<F, SQL | GridListField>;
  /** Everything the search box looks through. */
  searchText: SQL;
  /** After the chosen sort, so equal rows always come back in the same order (ends in a unique key). */
  tieBreak: SQL[];
  /** What the refusal calls it: "table" (the default) or "history" (audit_history_page's wording). */
  noun?: "table" | "history";
  /** Sort missing values last in both directions (audit_history_page's sorts). */
  nullsLast?: boolean;
}

/** The largest page a table serves (grid_check): the largest page size the grids offer. */
const MAX_PAGE_SIZE = Math.max(...GRID_LIMITS.pageSizes);

/**
 * A table query the table doesn't offer, as the SQL helpers raised it (BBK00
 * → 400). The services validate first (gridQuerySchema), so reaching this
 * means a caller bug: it is logged with which check failed, never the values.
 */
export function invalidQuery(check: string, noun: GridTable<string, string>["noun"] = "table"): ApiError {
  console.warn(`grid query refused: ${check}`);
  return new ApiError(400, `That ${noun} query isn't valid`);
}
function invalidFilter(check: string, noun: GridTable<string, string>["noun"] = "table"): ApiError {
  console.warn(`grid filter refused: ${check}`);
  return new ApiError(400, `That ${noun} filter isn't valid`);
}

/** Postgres' btrim(text): spaces only, not every kind of whitespace. */
const btrim = (text: string) => text.replace(/^ +| +$/g, "");

/** What Postgres' \s matches ([[:space:]]); JS's \s also matches no-break and other Unicode spaces. */
const PG_SPACE = /[ \t\n\r\f\v]+/;

/** A user's text as a LIKE pattern piece: \, % and _ match themselves (like_escape). */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The search box's words: every one must appear in the row (grid_words). */
export function gridWords(search: string | undefined): string[] {
  return btrim(search ?? "")
    .split(PG_SPACE)
    .filter((w) => w !== "");
}

const has = <K extends string>(map: Record<K, unknown>, key: string): key is K => Object.hasOwn(map, key);

/** Refuses what the table doesn't offer: a sort, direction, logic, page, page size, filter field or operator (grid_check). */
export function checkGrid<S extends string, F extends string>(table: GridTable<S, F>, query: GridQuery<S, F>): void {
  const { noun } = table;
  if (!has(table.sorts, query.sort)) throw invalidQuery("sort", noun);
  if (!SORT_DIRECTIONS.includes(query.dir)) throw invalidQuery("direction", noun);
  if (!FILTER_LOGICS.includes(query.logic)) throw invalidQuery("logic", noun);
  if (!Number.isInteger(query.page) || query.page < 0) throw invalidQuery("page", noun);
  if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > MAX_PAGE_SIZE) {
    throw invalidQuery("page size", noun);
  }
  if (!Array.isArray(query.filters)) throw invalidQuery("filters", noun);
  for (const f of query.filters) {
    if (!has(table.fields, f.field)) throw invalidFilter("field", noun);
    if (!GRID_OPERATORS.includes(f.operator)) throw invalidFilter("operator", noun);
    if (f.value !== undefined && Array.isArray(f.value) !== (f.operator === "isAnyOf")) throw invalidFilter("value", noun);
  }
}

/** A filter's values, trimmed, blanks dropped: one for most operators, several for "is any of". */
function valuesOf(filter: GridFilter<string>): string[] {
  return [filter.value ?? ""]
    .flat()
    .map(btrim)
    .filter((v) => v !== "");
}

/** Only filters that filter: one with a value, or an empty / not-empty check (grid_active_filters). */
function activeFilters<F extends string>(filters: GridFilter<F>[]): GridFilter<F>[] {
  return filters.filter((f) => f.operator === "isEmpty" || f.operator === "isNotEmpty" || valuesOf(f).length > 0);
}

/** One filter, as the filter panel offers them (audit_text_matches, plus the dropdown operators). */
function filterMatches(text: SQL, filter: GridFilter<string>): SQL {
  const values = valuesOf(filter);
  const value = values[0] ?? "";
  const pattern = likeEscape(value);
  switch (filter.operator) {
    case "isEmpty":
      return sql`coalesce(btrim(${text}), '') = ''`;
    case "isNotEmpty":
      return sql`coalesce(btrim(${text}), '') <> ''`;
    case "contains":
      return sql`coalesce(${text} ilike ${`%${pattern}%`}, false)`;
    case "equals":
    case "is":
      return sql`coalesce(lower(${text}) = lower(${value}), false)`;
    case "not":
      return sql`coalesce(lower(${text}) <> lower(${value}), true)`;
    case "isAnyOf":
      return sql`coalesce(lower(${text}) in (${sql.join(
        values.map((v) => sql`lower(${v})`),
        sql`, `
      )}), false)`;
    case "startsWith":
      return sql`coalesce(${text} ilike ${`${pattern}%`}, false)`;
    case "endsWith":
      return sql`coalesce(${text} ilike ${`%${pattern}`}, false)`;
  }
}

/** One filter on a column: a list column matches when one of its values does. */
function fieldMatches(field: SQL | GridListField, filter: GridFilter<string>): SQL {
  if (!("values" in field)) return filterMatches(field, filter);
  if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") return filterMatches(field.text, filter);
  if (filter.operator === "not") return sql`not ${fieldMatches(field, { ...filter, operator: "is" })}`;
  return sql`exists (select 1 from ${field.values} as grid_value(v) where ${filterMatches(sql`grid_value.v`, filter)})`;
}

/** Whether a row shows: every search word in its text, and the filters combined with and / or (grid_row_matches). */
export function gridWhere<S extends string, F extends string>(table: GridTable<S, F>, query: GridQuery<S, F>): SQL {
  const conditions = gridWords(query.search).map(
    (w) => sql`coalesce(${table.searchText}, '') ilike ${`%${likeEscape(w)}%`}`
  );
  const filters = activeFilters(query.filters).map((f) => fieldMatches(table.fields[f.field], f));
  if (filters.length > 0) {
    conditions.push(sql`(${sql.join(filters, query.logic === "or" ? sql` or ` : sql` and `)})`);
  }
  return conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;
}

/** The chosen sort, then the table's tie-break. */
export function gridOrderBy<S extends string, F extends string>(table: GridTable<S, F>, query: GridQuery<S, F>): SQL {
  const direction = query.dir === "asc" ? sql`asc` : sql`desc`;
  const dir = table.nullsLast ? sql`${direction} nulls last` : direction;
  const chosen = [table.sorts[query.sort]].flat().map((expr) => sql`${expr} ${dir}`);
  return sql.join([...chosen, ...table.tieBreak], sql`, `);
}

/**
 * The page to return, given the matching rows' count: the last one when the
 * asked-for page is past the end, 0 when nothing matches (the SQL functions'
 * v_page). SQL, so the count, the page and its rows come from one statement.
 */
export function gridPageNumber<S extends string, F extends string>(total: SQL, query: GridQuery<S, F>): SQL {
  return sql`least(${query.page}::int, greatest(0, ceil(${total}::numeric / ${query.pageSize}::int)::int - 1))`;
}

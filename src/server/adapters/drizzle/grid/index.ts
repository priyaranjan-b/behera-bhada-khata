import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { FILTER_LOGICS, GRID_TEXT_OPERATORS, SORT_DIRECTIONS, type FilterLogic, type GridTextOperator, type SortDirection } from "@/lib/domain/gridQuery";
import { ApiError } from "@/lib/errors";
import { GRID_LIMITS } from "@/lib/validation";

// The server-paged tables' search, filters, sort and page (A15, D28): the
// TypeScript twin of the SQL grid helpers in 0019 (grid_words, grid_check,
// grid_active_filters, grid_row_matches) and like_escape /
// audit_text_matches (0017), which it replaces. A query describes its table
// as SQL expressions over one row (`fields` for the filters, `searchText`
// for the search box, `sorts`); this builds the where and order by from the
// user's choices. Every value is a bound parameter; sort and field names
// only index into those maps, so a name the table doesn't offer is refused.

export interface GridFilter<F extends string> {
  field: F;
  operator: GridTextOperator;
  value?: string;
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

export interface GridTable<S extends string, F extends string> {
  /** Each sortable column's expression, or expressions sorted one after another in the same direction. */
  sorts: Record<S, SQL | SQL[]>;
  /** The text each filterable column shows (never null). */
  fields: Record<F, SQL>;
  /** Everything the search box looks through. */
  searchText: SQL;
  /** After the chosen sort, so equal rows always come back in the same order (ends in a unique key). */
  tieBreak: SQL[];
}

/** The largest page a table serves (grid_check): the largest page size the grids offer. */
const MAX_PAGE_SIZE = Math.max(...GRID_LIMITS.pageSizes);

/**
 * A table query the table doesn't offer, as the SQL helpers raised it (BBK00
 * → 400). The services validate first (gridQuerySchema), so reaching this
 * means a caller bug: it is logged with which check failed, never the values.
 */
export function invalidQuery(check: string): ApiError {
  console.warn(`grid query refused: ${check}`);
  return new ApiError(400, "That table query isn't valid");
}
function invalidFilter(check: string): ApiError {
  console.warn(`grid filter refused: ${check}`);
  return new ApiError(400, "That table filter isn't valid");
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
  if (!has(table.sorts, query.sort)) throw invalidQuery("sort");
  if (!SORT_DIRECTIONS.includes(query.dir)) throw invalidQuery("direction");
  if (!FILTER_LOGICS.includes(query.logic)) throw invalidQuery("logic");
  if (!Number.isInteger(query.page) || query.page < 0) throw invalidQuery("page");
  if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > MAX_PAGE_SIZE) {
    throw invalidQuery("page size");
  }
  if (!Array.isArray(query.filters)) throw invalidQuery("filters");
  for (const f of query.filters) {
    if (!has(table.fields, f.field)) throw invalidFilter("field");
    if (!GRID_TEXT_OPERATORS.includes(f.operator)) throw invalidFilter("operator");
  }
}

/** Only filters that filter: one with a value, or an empty / not-empty check (grid_active_filters). */
function activeFilters<F extends string>(filters: GridFilter<F>[]): GridFilter<F>[] {
  return filters.filter((f) => f.operator === "isEmpty" || f.operator === "isNotEmpty" || btrim(f.value ?? "") !== "");
}

/** One text filter, as the filter panel offers them (audit_text_matches). */
function filterMatches(text: SQL, filter: GridFilter<string>): SQL {
  const value = btrim(filter.value ?? "");
  const pattern = likeEscape(value);
  switch (filter.operator) {
    case "isEmpty":
      return sql`coalesce(btrim(${text}), '') = ''`;
    case "isNotEmpty":
      return sql`coalesce(btrim(${text}), '') <> ''`;
    case "contains":
      return sql`coalesce(${text} ilike ${`%${pattern}%`}, false)`;
    case "equals":
      return sql`coalesce(lower(${text}) = lower(${value}), false)`;
    case "startsWith":
      return sql`coalesce(${text} ilike ${`${pattern}%`}, false)`;
    case "endsWith":
      return sql`coalesce(${text} ilike ${`%${pattern}`}, false)`;
  }
}

/** Whether a row shows: every search word in its text, and the filters combined with and / or (grid_row_matches). */
export function gridWhere<S extends string, F extends string>(table: GridTable<S, F>, query: GridQuery<S, F>): SQL {
  const conditions = gridWords(query.search).map(
    (w) => sql`coalesce(${table.searchText}, '') ilike ${`%${likeEscape(w)}%`}`
  );
  const filters = activeFilters(query.filters).map((f) => filterMatches(table.fields[f.field], f));
  if (filters.length > 0) {
    conditions.push(sql`(${sql.join(filters, query.logic === "or" ? sql` or ` : sql` and `)})`);
  }
  return conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;
}

/** The chosen sort, then the table's tie-break. */
export function gridOrderBy<S extends string, F extends string>(table: GridTable<S, F>, query: GridQuery<S, F>): SQL {
  const dir = query.dir === "asc" ? sql`asc` : sql`desc`;
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

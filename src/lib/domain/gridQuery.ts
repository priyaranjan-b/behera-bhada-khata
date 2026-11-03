// A table that pages, sorts, searches and filters on the server (A14): the
// query a grid sends. The grid side (MUI models → these params) is
// src/components/ui/DataTable/serverQuery.ts; the server validates it with
// gridQuerySchema (src/lib/validation.ts) and runs it in SQL.

/** The text filters the server understands; server-side columns offer only these. */
export const GRID_TEXT_OPERATORS = ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"] as const;
export type GridTextOperator = (typeof GRID_TEXT_OPERATORS)[number];

/**
 * The dropdown filters of a column with a fixed set of values (a select
 * column: payment mode, status, tags): "is" / "is not" one value, or "is any
 * of" several (`value` is then a list). The server compares the text the
 * column shows, ignoring case.
 */
export const GRID_SELECT_OPERATORS = ["is", "not", "isAnyOf"] as const;
export type GridSelectOperator = (typeof GRID_SELECT_OPERATORS)[number];

export const GRID_OPERATORS = [...GRID_TEXT_OPERATORS, ...GRID_SELECT_OPERATORS] as const;
export type GridOperator = (typeof GRID_OPERATORS)[number];

/** One value, or several for "is any of". */
export type GridFilterValue = string | string[];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const FILTER_LOGICS = ["and", "or"] as const;
export type FilterLogic = (typeof FILTER_LOGICS)[number];

/** Operators that need no value. */
const VALUELESS: readonly GridOperator[] = ["isEmpty", "isNotEmpty"];

export interface GridFilter<F extends string = string> {
  field: F;
  operator: GridOperator;
  value?: GridFilterValue;
}

/** The query on the wire: query params, with `filters` as a JSON array of GridFilter. */
export interface GridQueryParams {
  /** 0-based. */
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: SortDirection;
  /** Search words; a row matches when it contains every one. */
  q?: string;
  filters?: string;
  logic?: FilterLogic;
}

/** Filters that actually filter: a value (at least one for "is any of"), or an operator that needs none. */
export function activeFilters<F extends string>(filters: GridFilter<F>[]): GridFilter<F>[] {
  return filters.filter((f) => {
    if (VALUELESS.includes(f.operator)) return true;
    const values = Array.isArray(f.value) ? f.value : [f.value ?? ""];
    return values.some((v) => v.trim() !== "");
  });
}

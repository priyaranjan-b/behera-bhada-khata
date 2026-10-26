"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GridFilterModel, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { errorMessage } from "@/lib/api-client";
import { GRID_LIMITS } from "@/lib/validation";
import { toGridQueryParams } from "./serverQuery";

/** One page from a server-side table's endpoint (A15). */
export interface ServerGridPage {
  /** Rows matching the query, across all pages. */
  total: number;
  /** All rows before "Show", dates, search and filters. */
  all: number;
  /** The page returned: the last one when the asked-for page is past the end. */
  page: number;
}

/** Everything the server query is built from. `extra` holds the table's own inputs ("Show", dates). */
interface View<E> {
  pagination: GridPaginationModel;
  sort: GridSortModel;
  filter: GridFilterModel;
  extra: E;
}

const PAGE_SIZES = [...GRID_LIMITS.pageSizes];

/** The first page: rendered by the Server Component, or loaded on mount (then `empty` shows until it arrives). */
type FirstPage<P> =
  | {
      /** The first page, loaded by the Server Component with the default query. */
      initial: P;
      empty?: undefined;
    }
  | {
      initial?: undefined;
      /** What the table holds until its first page arrives (a module constant). */
      empty: P;
    };

/**
 * State and handlers for a `DataTable` that pages, sorts, searches and
 * filters on the server (A15). Spread `gridProps` on the table; render the
 * table's own inputs from `extra` and change them with `setExtra`.
 *
 * Without `initial` the table loads its first page itself on mount, showing
 * `empty` with the grid's skeleton rows meanwhile, so it can sit in a lazy
 * tab (A16) with no Suspense or fallback around it.
 *
 * `load` and `toQuery` must be stable (module functions or memoised).
 * The guards here were each a bug once: an unchanged view returns early (the
 * grid re-reports normalised models, and a new object each time loops
 * forever), an unchanged query sends nothing, a stale reply is dropped, any
 * change but the page goes back to page 1, and the server's (clamped) page
 * is adopted.
 */
export function useServerGrid<P extends ServerGridPage, E extends object, Q extends GridQueryParams>({
  initial,
  empty,
  load,
  toQuery,
  defaultSort,
  defaultExtra,
  errorText,
}: FirstPage<P> & {
  load: (query: Q) => Promise<P>;
  /** The grid's params plus the table's own inputs. */
  toQuery: (grid: GridQueryParams, extra: E) => Q;
  defaultSort: GridSortModel;
  defaultExtra: E;
  errorText: string;
}) {
  const initialView: View<E> = {
    pagination: { page: 0, pageSize: GRID_LIMITS.pageSizes[0] },
    sort: defaultSort,
    filter: { items: [] },
    extra: defaultExtra,
  };
  const [view, setView] = useState<View<E>>(initialView);
  const [data, setData] = useState<P>(() => (initial ?? empty) as P);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef(view);
  const requestRef = useRef(0);

  const queryOf = useCallback(
    (v: View<E>) => toQuery(toGridQueryParams(v.pagination, v.sort, v.filter), v.extra),
    [toQuery]
  );

  // Fetches the page for view `v`; a reply to anything but the latest request is dropped.
  const run = useCallback(
    async (v: View<E>) => {
      const id = ++requestRef.current;
      setLoading(true);
      try {
        const page = await load(queryOf(v));
        if (id !== requestRef.current) return;
        setData(page);
        setError(null);
        if (page.page !== v.pagination.page) {
          viewRef.current = { ...v, pagination: { ...v.pagination, page: page.page } };
          setView(viewRef.current);
        }
      } catch (err) {
        if (id === requestRef.current) setError(errorMessage(err, errorText));
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [load, queryOf, errorText]
  );

  // No server-rendered first page: load it once, on mount.
  const loadsItself = !initial;
  useEffect(() => {
    if (loadsItself) void run(viewRef.current);
  }, [loadsItself, run]);

  const update = useCallback(
    async (change: Partial<View<E>>) => {
      const current = viewRef.current;
      const next: View<E> = { ...current, ...change };
      if (!change.pagination || change.pagination.pageSize !== current.pagination.pageSize) {
        next.pagination = { ...next.pagination, page: 0 };
      }
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      viewRef.current = next;
      setView(next);
      const query = queryOf(next);
      if (JSON.stringify(query) === JSON.stringify(queryOf(current))) return;

      await run(next);
    },
    [queryOf, run]
  );

  const onPaginationModelChange = useCallback((pagination: GridPaginationModel) => update({ pagination }), [update]);
  const onSortModelChange = useCallback((sort: GridSortModel) => update({ sort }), [update]);
  const onFilterModelChange = useCallback((filter: GridFilterModel) => update({ filter }), [update]);
  const setExtra = useCallback(
    (change: Partial<E>) => update({ extra: { ...viewRef.current.extra, ...change } }),
    [update]
  );

  const gridProps = useMemo(
    () => ({
      paginationMode: "server" as const,
      rowCount: data.total,
      totalCount: data.all,
      loading,
      paginationModel: view.pagination,
      onPaginationModelChange,
      sortModel: view.sort,
      onSortModelChange,
      filterModel: view.filter,
      onFilterModelChange,
      pageSizeOptions: PAGE_SIZES,
    }),
    [data.total, data.all, loading, view, onPaginationModelChange, onSortModelChange, onFilterModelChange]
  );

  return { data, error, extra: view.extra, setExtra, gridProps };
}

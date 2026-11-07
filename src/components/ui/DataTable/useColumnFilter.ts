"use client";

import { useCallback, useMemo } from "react";
import {
  gridColumnLookupSelector,
  gridFilterableColumnDefinitionsSelector,
  gridFilterModelSelector,
  useGridApiContext,
  useGridRootProps,
  useGridSelector,
  type GridFilterItem,
  type GridLocaleText,
} from "@mui/x-data-grid";
import { APP_LOCALE } from "@/lib/dates";
import { describeColumnFilter, filterColumnsOf, readColumnFilter, toFilterItem, type ColumnFilterValue } from "./columnFilter";

/**
 * The grid's one column filter as the phone sheet and chips see it (A30):
 * the columns it can be set on, what it is now, a way to set or remove it
 * and the chip's text.
 */
export function useColumnFilter() {
  const apiRef = useGridApiContext();
  const gridColumns = useGridSelector(apiRef, gridFilterableColumnDefinitionsSelector);
  const lookup = useGridSelector(apiRef, gridColumnLookupSelector);
  const model = useGridSelector(apiRef, gridFilterModelSelector);
  const { localeText } = useGridRootProps();

  const columns = useMemo(() => filterColumnsOf(gridColumns), [gridColumns]);
  const current = useMemo(() => readColumnFilter(model.items, columns), [model.items, columns]);

  /** Replace the filter with this column's (`null` value = remove it). */
  const set = useCallback(
    (field: string, value: ColumnFilterValue | null) => {
      const item = value ? toFilterItem(field, value) : null;
      const model = apiRef.current.state.filter.filterModel;
      apiRef.current.setFilterModel({ ...model, items: item ? [item] : [] });
    },
    [apiRef]
  );

  const clear = useCallback(() => {
    const model = apiRef.current.state.filter.filterModel;
    apiRef.current.setFilterModel({ ...model, items: [] });
  }, [apiRef]);

  /** The column's own formatter (₹ for money columns), so "≥ ₹5,000" reads like the cells. */
  const formatNumber = useCallback(
    (field: string) => (n: number) => {
      const col = lookup[field];
      const plain = n.toLocaleString(APP_LOCALE);
      if (!col?.valueFormatter) return plain;
      try {
        // Called outside a row (moneyColumn reads only the value), so no row or api: a
        // formatter that needs them falls back to the plain number instead of breaking the toolbar.
        const formatted = col.valueFormatter(n as never, {} as never, col, undefined as never);
        return formatted != null && formatted !== "" ? String(formatted) : plain;
      } catch {
        return plain;
      }
    },
    [lookup]
  );

  const label = useMemo((): string | null => {
    if (current.state === "simple") {
      return describeColumnFilter(current.column, current.value, formatNumber(current.column.field));
    }
    if (current.state === "other") return describeOther(current.item);
    return null;

    function describeOther(item: GridFilterItem): string {
      const col = lookup[item.field];
      const key = `filterOperator${item.operator.charAt(0).toUpperCase()}${item.operator.slice(1)}` as keyof GridLocaleText;
      const operator = localeText[key];
      return `${col?.headerName || item.field}: ${typeof operator === "string" ? operator : item.operator}…`;
    }
  }, [current, formatNumber, lookup, localeText]);

  return { columns, current, set, clear, label };
}

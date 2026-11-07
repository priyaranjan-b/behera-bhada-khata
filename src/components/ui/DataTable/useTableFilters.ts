"use client";

import { gridFilterActiveItemsSelector, gridQuickFilterValuesSelector, useGridApiContext, useGridSelector } from "@mui/x-data-grid";
import { useDataTable } from "./context";

/**
 * What narrows a table right now - the "Show" selects away from their
 * default, the table's own inputs (`toolbarExtraFilter`), the grid's column
 * filters and search - and a way to undo it. Read by the empty-results
 * overlay, the phone filter sheet and its chips.
 */
export function useTableFilters() {
  const { filters, toolbarExtraFilter } = useDataTable();
  const apiRef = useGridApiContext();
  const filterItems = useGridSelector(apiRef, gridFilterActiveItemsSelector);
  const quickValues = useGridSelector(apiRef, gridQuickFilterValuesSelector);

  const changedFilters = filters.filter((f) => f.defaultValue !== undefined && f.value !== f.defaultValue);
  const searching = (quickValues?.length ?? 0) > 0;
  /** Something besides search narrows the rows: what "Clear all" (which keeps search) can undo. */
  const canClearFilters = filterItems.length > 0 || changedFilters.length > 0 || Boolean(toolbarExtraFilter);
  const canClear = canClearFilters || searching;

  /** Back to the defaults; `keepSearch` leaves the search box as it is. */
  function clearAll({ keepSearch = false }: { keepSearch?: boolean } = {}) {
    apiRef.current.setFilterModel({ items: [], quickFilterValues: keepSearch ? quickValues : [] });
    for (const f of changedFilters) f.onChange(f.defaultValue);
    toolbarExtraFilter?.onClear();
  }

  return { changedFilters, columnFilterCount: filterItems.length, searching, canClear, canClearFilters, clearAll };
}

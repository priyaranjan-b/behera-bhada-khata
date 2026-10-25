"use client";

import { createContext, useContext } from "react";

/** A "Show: …" select in the table toolbar, filtering rows before the grid sees them. */
export interface DataTableFilter<T extends string = string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Value "Clear filters" resets to; the filter counts as active while it differs. */
  defaultValue?: T;
}

export interface DataTableSearch {
  placeholder?: string;
}

/**
 * What the toolbar, pagination and overlay slots need from `DataTable`.
 * Passed through context rather than `slotProps` so the slot components stay
 * stable (no remount per render) and no global MUI type augmentation is needed.
 */
export interface DataTableConfig {
  title?: string;
  titleId: string;
  subtitle?: React.ReactNode;
  /** Rows before the caller's own filters; the count chip reads "visible of total". */
  totalCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each filter has its own value union
  filters: DataTableFilter<any>[];
  toolbarExtra?: React.ReactNode;
  search: DataTableSearch | false;
  columnsButton: boolean;
  filterButton: boolean;
  exportCsv: boolean;
  exportExcel: boolean;
  pageSizeOptions: number[];
  noRowsLabel: string;
}

export const DataTableContext = createContext<DataTableConfig | null>(null);

export function useDataTable(): DataTableConfig {
  const config = useContext(DataTableContext);
  if (!config) throw new Error("DataTable slots must render inside <DataTable>");
  return config;
}

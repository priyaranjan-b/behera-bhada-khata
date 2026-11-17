import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { formatDateKey, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * Right-aligned, tabular, ₹-formatted number column. `total: true` adds it
 * up in the table's footer (A26): every row the search and filters leave,
 * across all pages.
 */
export function moneyColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  extra: Partial<DataTableColDef<R>> = {}
): DataTableColDef<R> {
  return {
    field,
    headerName,
    type: "number",
    minWidth: 110,
    flex: 0.6,
    headerAlign: "right",
    align: "right",
    valueFormatter: (value: number | null | undefined) => (value == null ? "" : formatMoney(value)),
    cellClassName: "money-cell",
    ...extra,
  };
}

/**
 * A column with an optional `exportValue`: what the Excel download writes when
 * the grid value is built for search (e.g. name + contact in one string).
 * Without it the download uses the formatted value, or the number for
 * `type: "number"` columns.
 */
export type DataTableColDef<R extends GridValidRowModel> = GridColDef<R> & {
  exportValue?: (row: R) => string | number | null;
  /** A money column added up in the footer and the Excel download (`moneyColumn`, A26). */
  total?: boolean;
  /** A date column (`dateColumn`): shown, searched and exported in the owner's date format (A36). */
  dateKind?: "date" | "dateTime";
  /** What an empty date column shows. */
  emptyText?: string;
};

/**
 * A date column: the value is a yyyy-MM-dd key (`dateTime`: an ISO instant),
 * shown, searched and exported in the owner's display format (A36) - the
 * table applies it (`withDateFormat`), so the column can stay a module
 * constant.
 */
export function dateColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  extra: Partial<DataTableColDef<R>> = {}
): DataTableColDef<R> {
  return { field, headerName, minWidth: 110, flex: 0.6, dateKind: "date", ...extra };
}

/** The table's columns with each date column formatted in `format` (DataTable calls it). */
export function withDateFormat<R extends GridValidRowModel>(
  columns: readonly GridColDef<R>[],
  format: string
): GridColDef<R>[] {
  return columns.map((column) => {
    const col = column as DataTableColDef<R>;
    if (!col.dateKind) return column;
    const kind = col.dateKind;
    return {
      ...col,
      valueFormatter: (value: string | null | undefined) =>
        value ? (kind === "dateTime" ? formatDateTime(value, format) : formatDateKey(value, format)) : (col.emptyText ?? ""),
    } as GridColDef<R>;
  });
}

/** A dropdown choice: a value with the label it shows, or a value that is its own label. */
export type SelectOption = string | { value: string; label: string };

/**
 * A column of a fixed set of values (a mode, a status, a type): its column
 * filter is a dropdown - "is", "is not", "is any of" - instead of free text.
 *
 * In a client-side table the cell value is the raw value and `options`
 * label it (`UNIT_TYPE_OPTIONS`). A server-side table (A14) filters on the
 * text the column shows, so there the cell value is the label (a
 * `valueGetter`) and `options` the labels themselves.
 */
export function selectColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  options: readonly SelectOption[],
  extra: Partial<DataTableColDef<R>> = {}
): DataTableColDef<R> {
  return { field, headerName, type: "singleSelect", valueOptions: [...options], ...extra } as DataTableColDef<R>;
}

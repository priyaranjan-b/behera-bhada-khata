import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { formatMoney } from "@/lib/money";

/** Right-aligned, tabular, ₹-formatted number column. */
export function moneyColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  extra: Partial<GridColDef<R>> = {}
): GridColDef<R> {
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
};

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

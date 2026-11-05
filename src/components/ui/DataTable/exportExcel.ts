"use client";

import {
  gridFilteredSortedRowIdsSelector,
  gridVisibleColumnDefinitionsSelector,
  type GridColDef,
  type GridValidRowModel,
  type useGridApiContext,
} from "@mui/x-data-grid";
import { todayKey } from "@/lib/dates";
import { downloadBlob } from "@/lib/download";
import { buildXlsx, XLSX_MIME, type XlsxCell } from "@/lib/xlsx";
import type { DataTableColDef } from "./columns";
import { sumColumns } from "./totals";

type GridApiRef = ReturnType<typeof useGridApiContext>;
// Columns as the grid holds them; a DataTableColDef keeps its `exportValue` there.
type ExportColumn = GridColDef & Pick<DataTableColDef<GridValidRowModel>, "exportValue" | "total">;

/** Grid-internal columns that never belong in a download. */
const SKIPPED_FIELDS = new Set(["__check__", "__detail_panel_toggle__"]);

function exportedColumns(apiRef: GridApiRef): ExportColumn[] {
  return gridVisibleColumnDefinitionsSelector(apiRef).filter(
    (col) => !col.disableExport && col.type !== "actions" && !SKIPPED_FIELDS.has(col.field)
  );
}

function cellOf(apiRef: GridApiRef, row: GridValidRowModel, col: ExportColumn): XlsxCell {
  if (col.exportValue) return col.exportValue(row);
  const value: unknown = apiRef.current.getRowValue(row, col);
  // Numbers stay numbers so Excel can sum them; everything else as the grid formats it.
  if (col.type === "number" && typeof value === "number") return value;
  const formatted: unknown = apiRef.current.getRowFormattedValue(row, col);
  if (formatted === null || formatted === undefined) return null;
  if (typeof formatted === "boolean") return formatted ? "Yes" : "No";
  if (typeof formatted === "number" || typeof formatted === "string") return formatted;
  return String(formatted);
}

/** "Total" under the first column (unless it is added up itself), then each `total` column's sum (A26). */
function totalsRow(apiRef: GridApiRef, columns: ExportColumn[], rows: GridValidRowModel[]): XlsxCell[] | null {
  const summed = columns.filter((col) => col.total);
  if (summed.length === 0) return null;
  const sums = new Map(
    sumColumns(rows, summed, (row, col) => apiRef.current.getRowValue(row, col)).map((t) => [
      t.field,
      t.amount,
    ])
  );
  return columns.map((col, i) => sums.get(col.field) ?? (i === 0 ? "Total" : null));
}

/**
 * Downloads what the grid shows - its rows after search, filters and sort,
 * across every page, and its visible columns - as an .xlsx file, with a
 * total row when `withTotals` (all rows are in it: a client-side table).
 */
export function downloadGridAsExcel(apiRef: GridApiRef, title = "Table", { withTotals = false } = {}): void {
  const columns = exportedColumns(apiRef);
  const source = gridFilteredSortedRowIdsSelector(apiRef).map((id) => apiRef.current.getRow(id) as GridValidRowModel);
  const rows = source.map((row) => columns.map((col) => cellOf(apiRef, row, col)));
  const total = withTotals && source.length > 0 ? totalsRow(apiRef, columns, source) : null;
  if (total) rows.push(total);
  const bytes = buildXlsx({ name: title, header: columns.map((col) => col.headerName ?? col.field), rows });
  const fileName = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Table"} ${todayKey()}.xlsx`;
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), fileName);
}

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

type GridApiRef = ReturnType<typeof useGridApiContext>;
// Columns as the grid holds them; a DataTableColDef keeps its `exportValue` there.
type ExportColumn = GridColDef & Pick<DataTableColDef<GridValidRowModel>, "exportValue">;

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

/**
 * Downloads what the grid shows - its rows after search, filters and sort,
 * across every page, and its visible columns - as an .xlsx file.
 */
export function downloadGridAsExcel(apiRef: GridApiRef, title = "Table"): void {
  const columns = exportedColumns(apiRef);
  const rows = gridFilteredSortedRowIdsSelector(apiRef).map((id) => {
    const row = apiRef.current.getRow(id) as GridValidRowModel;
    return columns.map((col) => cellOf(apiRef, row, col));
  });
  const bytes = buildXlsx({ name: title, header: columns.map((col) => col.headerName ?? col.field), rows });
  const fileName = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Table"} ${todayKey()}.xlsx`;
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), fileName);
}

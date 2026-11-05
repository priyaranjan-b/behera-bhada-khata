"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { RefObject } from "react";
import {
  gridFilteredSortedRowIdsSelector,
  gridVisibleColumnDefinitionsSelector,
  useGridApiContext,
  useGridSelector,
  type GridApiCommon,
  type GridColDef,
  type GridValidRowModel,
} from "@mui/x-data-grid";
import { formatMoney } from "@/lib/money";
import type { DataTableColDef } from "./columns";
import { useDataTable } from "./context";
import { pickColumnTotals, sumColumns, type ColumnTotal } from "./totals";

const isTotal = (col: GridColDef) => Boolean((col as DataTableColDef<GridValidRowModel>).total);

/**
 * The visible `total` columns with their sums over every row the grid's
 * search and filters leave (all pages), or just the columns when `server`
 * (the grid holds one page then, and the server sends the totals).
 */
function selectTotals(apiRef: RefObject<GridApiCommon>, server: boolean): ColumnTotal[] {
  const columns = gridVisibleColumnDefinitionsSelector(apiRef).filter(isTotal);
  if (server || columns.length === 0) return columns.map((col) => ({ field: col.field, label: col.headerName ?? col.field, amount: 0 }));
  const rows = gridFilteredSortedRowIdsSelector(apiRef).map((id) => apiRef.current.getRow(id) as GridValidRowModel);
  return sumColumns(rows, columns, (row, col) => apiRef.current.getRowValue(row, col));
}

/** Re-render only when a figure or a column changes, not on every grid state update. */
const sameTotals = <U,>(a: U, b: U) => JSON.stringify(a) === JSON.stringify(b);

/**
 * "Total · Billed ₹1,20,000 · Collected ₹98,000" in the footer (A26): the
 * visible `total` columns over every row the search and filters leave, on
 * every page. A server-paged table holds one page, so it shows the totals
 * the server sent (`columnTotals`) and never adds up the page itself.
 */
export default function DataTableTotals() {
  const { columnTotals, totalsNote, matchingCount } = useDataTable();
  const apiRef = useGridApiContext();
  const server = matchingCount !== undefined;
  const selected = useGridSelector(apiRef, selectTotals, server, sameTotals);
  const totals = server ? pickColumnTotals(selected, columnTotals ?? {}) : selected;
  if (totals.length === 0) return null;
  const single = totals.length === 1;

  return (
    <Stack
      direction="row"
      aria-live="polite"
      sx={{ flexWrap: "wrap", alignItems: "baseline", columnGap: 2, rowGap: 0.25, minWidth: 0 }}
    >
      <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 600 }}>
        Total
      </Typography>
      {totals.map((t) => (
        <Typography key={t.field} variant="body2" component="span" sx={{ whiteSpace: "nowrap" }}>
          {single ? null : (
            <Typography component="span" variant="body2" color="textSecondary">
              {t.label}{" "}
            </Typography>
          )}
          <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
            {formatMoney(t.amount)}
          </Typography>
        </Typography>
      ))}
      {totalsNote ? (
        <Typography variant="caption" color="textSecondary">
          {totalsNote}
        </Typography>
      ) : null}
    </Stack>
  );
}

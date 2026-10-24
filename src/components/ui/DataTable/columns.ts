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

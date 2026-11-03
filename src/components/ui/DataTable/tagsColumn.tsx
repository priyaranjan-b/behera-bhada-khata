import type { GridValidRowModel } from "@mui/x-data-grid";
import { TagsCell } from "@/components/ui/GridCells";
import { selectColumn, type DataTableColDef } from "./columns";

/**
 * A server-filtered column of tag pills (a payment's tags, 0030). Its column
 * filter is a dropdown of `options` (the tag suggestions): "is Padma" finds
 * a payment with Padma among its tags, "is not Padma" one without. The grid
 * value is the names joined with ", ", as the Excel download writes them.
 * Pass `renderCell` to add an action.
 */
export function tagsColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  tagsOf: (row: R) => readonly string[],
  options: readonly string[],
  extra: Partial<DataTableColDef<R>> = {}
): DataTableColDef<R> {
  return selectColumn<R>(field, headerName, options, {
    flex: 1,
    minWidth: 160,
    sortable: false,
    valueGetter: (_value, row) => tagsOf(row).join(", "),
    exportValue: (row) => tagsOf(row).join(", "),
    renderCell: ({ row }) => <TagsCell tags={tagsOf(row)} />,
    ...extra,
  });
}

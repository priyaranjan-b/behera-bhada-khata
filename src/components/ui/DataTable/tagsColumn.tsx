import type { GridValidRowModel } from "@mui/x-data-grid";
import { TagsCell } from "@/components/ui/GridCells";
import type { DataTableColDef } from "./columns";
import { SERVER_TEXT_OPERATORS } from "./serverQuery";

/**
 * A server-filtered column of tag pills (a payment's tags, 0030). The grid
 * value is the names joined with ", ", so the Excel download and the column
 * filter read the same text. Pass `renderCell` to add an action.
 */
export function tagsColumn<R extends GridValidRowModel>(
  field: string,
  headerName: string,
  tagsOf: (row: R) => readonly string[],
  extra: Partial<DataTableColDef<R>> = {}
): DataTableColDef<R> {
  return {
    field,
    headerName,
    flex: 1,
    minWidth: 160,
    sortable: false,
    filterOperators: SERVER_TEXT_OPERATORS,
    valueGetter: (_value, row) => tagsOf(row).join(", "),
    exportValue: (row) => tagsOf(row).join(", "),
    renderCell: ({ row }) => <TagsCell tags={tagsOf(row)} />,
    ...extra,
  };
}

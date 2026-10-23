"use client";

import { DataGrid, gridClasses, type DataGridProps, type GridColDef, type GridValidRowModel } from "@mui/x-data-grid";
import type { Theme } from "@mui/material/styles";
import { lightSurfaces } from "@/theme/appTokens";
import { formatMoney } from "@/lib/money";

// Light scheme: white table surface over the slate canvas, soft slate row hover.
const lightSurfaceSx = (theme: Theme) =>
  theme.applyStyles("light", {
    backgroundColor: lightSurfaces.paper,
    [`& .${gridClasses.columnHeader}, & .${gridClasses.footerContainer}`]: { backgroundColor: lightSurfaces.paper },
    [`& .${gridClasses.row}`]: {
      transition: theme.transitions.create("background-color", { duration: theme.transitions.duration.shortest }),
      "&:hover": { backgroundColor: lightSurfaces.rowHover },
    },
  });

/**
 * MUI X Data Grid with the template's look and this app's defaults: zebra
 * rows, compact density, sizes to its content, no row selection.
 * Column definitions (renderCell etc.) must live in a client component, so
 * server pages pass plain rows to a small "*Grid.tsx" client file.
 */
export default function AppDataGrid<R extends GridValidRowModel>({
  quickFilter = false,
  pageSize = 25,
  initialState,
  slotProps,
  sx,
  label,
  ...props
}: DataGridProps<R> & { quickFilter?: boolean; pageSize?: number }) {
  const paginate = (props.rows?.length ?? 0) > pageSize;
  return (
    <DataGrid<R>
      autoHeight
      density="compact"
      rowHeight={52}
      disableRowSelectionOnClick
      disableColumnResize
      hideFooter={!paginate}
      pageSizeOptions={[10, 25, 50, 100]}
      getRowClassName={(params) => (params.indexRelativeToCurrentPage % 2 === 0 ? "even" : "odd")}
      showToolbar={quickFilter}
      // `label` would also be printed in the toolbar, duplicating the panel title.
      aria-label={label}
      {...props}
      initialState={{ pagination: { paginationModel: { pageSize } }, ...initialState }}
      slotProps={{
        toolbar: {
          showQuickFilter: true,
          csvOptions: { disableToolbarButton: true },
          printOptions: { disableToolbarButton: true },
        },
        ...slotProps,
      }}
      sx={[
        { border: 0, borderRadius: 0, "& .money-cell": { fontWeight: 500 } },
        lightSurfaceSx,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

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

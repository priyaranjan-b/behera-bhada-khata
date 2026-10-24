"use client";

import { useId } from "react";
import Box from "@mui/material/Box";
import AppCard from "@/components/ui/AppCard";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DataGrid, type DataGridProps, type GridValidRowModel } from "@mui/x-data-grid";
import { DataTableContext, type DataTableConfig, type DataTableFilter, type DataTableSearch } from "./context";
import DataTableToolbar from "./DataTableToolbar";
import DataTablePagination from "./DataTablePagination";
import DataTableNoResults from "./DataTableNoResults";
import { dataTableSx, HEADER_HEIGHT, ROW_HEIGHT } from "./styles";

const SLOTS = {
  toolbar: DataTableToolbar,
  pagination: DataTablePagination,
  noRowsOverlay: DataTableNoResults,
  noResultsOverlay: DataTableNoResults,
};

export type DataTableProps<R extends GridValidRowModel> = Omit<DataGridProps<R>, "slots" | "showToolbar"> & {
  /** Heading in the toolbar row; also labels the table for screen readers. */
  title?: string;
  subtitle?: React.ReactNode;
  /** Row count before the caller's own filters (default `rows.length`); the chip reads "visible of total". */
  totalCount?: number;
  /** "Show: …" selects in the toolbar row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each filter has its own value union
  filters?: DataTableFilter<any>[];
  /** Custom inputs placed before the search box (e.g. a date range). */
  toolbarExtra?: React.ReactNode;
  /** Quick search over every column. Default: on when there are more than 8 rows. */
  search?: boolean | DataTableSearch;
  columnsButton?: boolean;
  filterButton?: boolean;
  exportCsv?: boolean;
  /** Rows per page. @default 10 */
  pageSize?: number;
  pageSizeOptions?: number[];
  /** Shown instead of the table when there is nothing at all (`totalCount === 0`). */
  emptyState?: React.ReactNode;
  /** Message when filters leave no rows. */
  noRowsLabel?: string;
  /** `standard` (56px) fits two-line identity cells; `dense` (44px) is for one-line tables. */
  rowDensity?: keyof typeof ROW_HEIGHT;
  /** `card` frames the table in an outlined card; `plain` for tables already inside one. */
  variant?: "card" | "plain";
};

/**
 * The app's table: MUI X Data Grid with one compact toolbar row (title,
 * count, "Show" filters, search, filter and columns), a tinted header band,
 * zebra rows and numbered pagination (10 rows a page).
 * Column definitions (renderCell etc.) must live in a client component, so
 * server pages pass plain rows to a small "*Grid.tsx" client file.
 */
export default function DataTable<R extends GridValidRowModel>({
  title,
  subtitle,
  totalCount,
  filters = [],
  toolbarExtra,
  search,
  columnsButton = true,
  filterButton = true,
  exportCsv = false,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyState,
  noRowsLabel = "No rows match these filters.",
  rowDensity = "standard",
  variant = "card",
  initialState,
  getRowClassName,
  slotProps,
  sx,
  label,
  ...props
}: DataTableProps<R>) {
  const titleId = useId();
  const rowCount = props.rows?.length ?? 0;
  const total = totalCount ?? rowCount;
  const searchConfig: DataTableSearch | false =
    search === undefined ? (total > 8 ? {} : false) : search === true ? {} : search || false;

  const config: DataTableConfig = {
    title,
    titleId,
    subtitle,
    totalCount: total,
    filters,
    toolbarExtra,
    search: searchConfig,
    columnsButton,
    filterButton,
    exportCsv,
    pageSizeOptions,
    noRowsLabel,
  };

  const showToolbar =
    Boolean(title) || filters.length > 0 || Boolean(toolbarExtra) || Boolean(searchConfig) || columnsButton || filterButton || exportCsv;
  // Hide the footer only while everything fits the smallest page, so a bigger page size can always be undone.
  const hideFooter = rowCount <= Math.min(pageSize, ...pageSizeOptions);

  const body =
    total === 0 && emptyState ? (
      <>
        {title ? (
          <Box sx={{ px: 2, pt: 2 }}>
            <Typography id={titleId} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="textSecondary" component="p">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        ) : null}
        {emptyState}
      </>
    ) : (
      <DataTableContext.Provider value={config}>
        <DataGrid<R>
          autoHeight
          density="standard"
          rowHeight={ROW_HEIGHT[rowDensity]}
          columnHeaderHeight={HEADER_HEIGHT}
          disableRowSelectionOnClick
          disableColumnResize
          hideFooter={hideFooter}
          hideFooterSelectedRowCount
          pageSizeOptions={pageSizeOptions}
          getRowClassName={(params) =>
            [params.indexRelativeToCurrentPage % 2 === 0 ? "even" : "odd", getRowClassName?.(params)]
              .filter(Boolean)
              .join(" ")
          }
          showToolbar={showToolbar}
          {...(title ? { "aria-labelledby": titleId } : { "aria-label": label })}
          {...props}
          slots={SLOTS}
          initialState={{ ...initialState, pagination: { paginationModel: { pageSize }, ...initialState?.pagination } }}
          slotProps={{ loadingOverlay: { variant: "skeleton", noRowsVariant: "skeleton" }, ...slotProps }}
          sx={[dataTableSx, ...(Array.isArray(sx) ? sx : [sx])]}
        />
      </DataTableContext.Provider>
    );

  if (variant === "plain") return <Box sx={{ minWidth: 0 }}>{body}</Box>;
  return (
    <AppCard
      component="section"
      aria-labelledby={title ? titleId : undefined}
      sx={{ p: 0, overflow: "hidden", minWidth: 0 }}
    >
      <Stack>{body}</Stack>
    </AppCard>
  );
}

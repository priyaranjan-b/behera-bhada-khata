"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, { moneyColumn, SERVER_TEXT_OPERATORS, useServerGrid, type DataTableColDef } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/domain/StatusChip";
import { api } from "@/lib/api-client";
import type { TablePage, TenantMonthRow, TenantMonthsQuery } from "@/lib/contracts";
import { TENANT_MONTH_SHOW_OPTIONS, type TenantMonthShow } from "@/lib/domain/billing";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { statusLabel } from "@/lib/domain/status";

const columns: DataTableColDef<TenantMonthRow>[] = [
  {
    field: "periodMonth",
    headerName: "Month",
    flex: 1,
    minWidth: 150,
    // Formatted by the database, which also searches and filters this text.
    valueFormatter: (_value, row) => row.monthLabel,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  moneyColumn<TenantMonthRow>("amountDue", "Due", { filterable: false }),
  moneyColumn<TenantMonthRow>("amountAllocated", "Allocated", { filterable: false }),
  {
    field: "status",
    headerName: "Status",
    minWidth: 140,
    headerAlign: "right",
    align: "right",
    valueFormatter: (_value, row) => statusLabel(row.displayStatus),
    renderCell: ({ row }) => <StatusChip status={row.displayStatus} />,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
];

interface Extra {
  show: TenantMonthShow;
}

const DEFAULT_EXTRA: Extra = { show: "all" };
const DEFAULT_SORT: GridSortModel = [{ field: "periodMonth", sort: "desc" }];
const EMPTY: TablePage<TenantMonthRow> = { rows: [], total: 0, all: 0, page: 0 };
const toQuery = (grid: GridQueryParams, extra: Extra): TenantMonthsQuery => ({ ...grid, show: extra.show });

/**
 * A tenant's rent months, one page at a time: paging, sort, search and "Show"
 * run in SQL (A15). Loads its first page when mounted (the Months tab, A16).
 */
export default function TenantPeriodsGrid({ tenantId }: { tenantId: string }) {
  const load = useCallback((query: TenantMonthsQuery) => api.dashboard.tenants.months(tenantId, query), [tenantId]);
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    empty: EMPTY,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the months.",
  });

  const filters = useMemo(
    () => [
      {
        label: "Show",
        value: extra.show,
        options: TENANT_MONTH_SHOW_OPTIONS,
        onChange: (show: TenantMonthShow) => setExtra({ show }),
        defaultValue: "all" as TenantMonthShow,
      },
    ],
    [extra.show, setExtra]
  );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<TenantMonthRow>
        title="Months"
        subtitle="Rent owed and allocated per month"
        rows={data.rows}
        columns={columns}
        {...gridProps}
        filters={filters}
        search={{ placeholder: "Search months…" }}
        rowDensity="dense"
        noRowsLabel="No months match these filters."
      />
    </Stack>
  );
}

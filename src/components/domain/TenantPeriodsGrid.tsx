"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  moneyColumn,
  selectColumn,
  SERVER_TEXT_OPERATORS,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { StatusChip } from "@/components/domain/StatusChip";
import { orTenantSignIn } from "@/components/domain/tenantSignedOut";
import { api } from "@/lib/api-client";
import type { TenantMonthRow, TenantMonthsPage, TenantMonthsQuery } from "@/lib/contracts";
import { TENANT_MONTH_DISPLAY_STATUSES, TENANT_MONTH_SHOW_OPTIONS, type TenantMonthShow } from "@/lib/domain/billing";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { statusLabel } from "@/lib/domain/status";
import { formatMoney } from "@/lib/money";

/** The Months columns; `paidHeader` is the owner's "Allocated" or the tenant's "Paid" (A32). */
const monthColumns = (paidHeader: string): DataTableColDef<TenantMonthRow>[] => [
  {
    field: "periodMonth",
    headerName: "Month",
    flex: 1,
    minWidth: 150,
    // Formatted by the database, which also searches and filters this text.
    valueFormatter: (_value, row) => row.monthLabel,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  moneyColumn<TenantMonthRow>("amountDue", "Due", { filterable: false, total: true }),
  moneyColumn<TenantMonthRow>("amountAllocated", paidHeader, { filterable: false, total: true }),
  // The database filters on the label the column shows.
  selectColumn<TenantMonthRow>("status", "Status", TENANT_MONTH_DISPLAY_STATUSES.map(statusLabel), {
    minWidth: 140,
    headerAlign: "right",
    align: "right",
    valueGetter: (_value, row) => statusLabel(row.displayStatus),
    renderCell: ({ row }) => <StatusChip status={row.displayStatus} />,
  }),
];
const OWNER_COLUMNS = monthColumns("Allocated");
const TENANT_COLUMNS = monthColumns("Paid");

interface Extra {
  show: TenantMonthShow;
}

const DEFAULT_EXTRA: Extra = { show: "all" };
const DEFAULT_SORT: GridSortModel = [{ field: "periodMonth", sort: "desc" }];
const EMPTY: TenantMonthsPage = {
  rows: [],
  total: 0,
  all: 0,
  page: 0,
  totals: { amountDue: 0, amountAllocated: 0 },
  notYetDue: 0,
};
const toQuery = (grid: GridQueryParams, extra: Extra): TenantMonthsQuery => ({ ...grid, show: extra.show });

/**
 * A tenant's rent months, one page at a time: paging, sort, search and "Show"
 * run in SQL (A15). Loads its first page when mounted (the Months tab, A16).
 * `source`: the owner's API for one tenant, or the signed-in tenant's own (A32).
 */
export default function TenantPeriodsGrid(props: { source: "owner"; tenantId: string } | { source: "tenant" }) {
  const tenantId = props.source === "owner" ? props.tenantId : null;
  const load = useCallback(
    (query: TenantMonthsQuery) =>
      tenantId === null ? orTenantSignIn(api.tenant.months(query)) : api.dashboard.tenants.months(tenantId, query),
    [tenantId]
  );
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    empty: EMPTY,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: tenantId === null ? "Couldn't load your rent months." : "Couldn't load the months.",
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
        columnTotals={data.totals}
        totalsNote={data.notYetDue > 0 ? `Due incl. ${formatMoney(data.notYetDue)} not due yet` : undefined}
        columns={tenantId === null ? TENANT_COLUMNS : OWNER_COLUMNS}
        {...gridProps}
        filters={filters}
        search={{ placeholder: "Search months…" }}
        rowDensity="dense"
        noRowsLabel="No months match these filters."
      />
    </Stack>
  );
}

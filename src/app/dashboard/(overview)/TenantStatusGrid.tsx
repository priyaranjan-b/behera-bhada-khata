"use client";

import type { GridColDef } from "@mui/x-data-grid";
import DataTable, { moneyColumn } from "@/components/ui/DataTable";
import { IdentityCell, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { StatusChip } from "@/components/domain/StatusChip";
import { formatMoney } from "@/lib/money";
import type { TenantMonthRow } from "@/lib/domain/reports";

const columns: GridColDef<TenantMonthRow>[] = [
  {
    field: "tenantName",
    headerName: "Tenant",
    flex: 1.4,
    minWidth: 200,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.tenantName}
        caption={row.movedOut ? "Moved out - still owes" : undefined}
        href={`/dashboard/tenants/${row.tenantId}`}
      />
    ),
  },
  {
    field: "propertyName",
    headerName: "Property",
    flex: 1,
    minWidth: 140,
    renderCell: ({ row }) => <TagPill label={row.propertyName} />,
  },
  moneyColumn<TenantMonthRow>("monthDue", "Due"),
  moneyColumn<TenantMonthRow>("monthAllocated", "Collected"),
  {
    field: "monthStatus",
    headerName: "This month",
    minWidth: 130,
    headerAlign: "right",
    align: "right",
    renderCell: ({ row }) => <StatusChip status={row.monthStatus} />,
  },
  {
    field: "totalOutstanding",
    headerName: "Outstanding",
    type: "number",
    minWidth: 200,
    flex: 1,
    headerAlign: "right",
    align: "right",
    renderCell: ({ row }) =>
      row.totalOutstanding > 0 ? (
        <StatusBadge
          tone={row.overdueMonths > 0 ? "danger" : "warning"}
          label={formatMoney(row.totalOutstanding) + (row.overdueMonths > 0 ? ` · ${row.overdueMonths}mo overdue` : "")}
        />
      ) : (
        <StatusBadge tone="success" label="Settled" />
      ),
  },
];

export default function TenantStatusGrid({
  rows,
  monthLabel,
  emptyState,
}: {
  rows: TenantMonthRow[];
  monthLabel: string;
  emptyState?: React.ReactNode;
}) {
  return (
    <DataTable<TenantMonthRow>
      title="Tenants"
      subtitle={`Rent status for ${monthLabel}`}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.tenantId}
      search={{ placeholder: "Search tenant…" }}
      noRowsLabel="No tenants match."
      emptyState={emptyState}
      initialState={{
        sorting: { sortModel: [{ field: "totalOutstanding", sort: "desc" }] },
        columns: { columnVisibilityModel: {} },
      }}
    />
  );
}

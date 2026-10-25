"use client";

import { useMemo, useState } from "react";
import type { GridColDef } from "@mui/x-data-grid";
import Box from "@mui/material/Box";
import DataTable, { moneyColumn } from "@/components/ui/DataTable";
import { IdentityCell, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { StatusChip } from "@/components/domain/StatusChip";
import { formatMoney } from "@/lib/money";
import { statusLabel } from "@/lib/domain/status";
import type { TenantMonthRow } from "@/lib/domain/reports";
import { routes } from "@/lib/routes";

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
        href={routes.tenants.detail(row.tenantId)}
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
    valueFormatter: (value: string) => statusLabel(value),
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

type MonthFilter = "all" | "due" | "collected" | "unpaid";

const MONTH_FILTERS: { value: MonthFilter; label: string }[] = [
  { value: "all", label: "All tenants" },
  { value: "due", label: "Rent due" },
  { value: "collected", label: "Paid something" },
  { value: "unpaid", label: "Not fully paid" },
];

// "due" and "collected" are the tenants behind the Expected and Collected cards.
function matchesMonth(row: TenantMonthRow, filter: MonthFilter): boolean {
  switch (filter) {
    case "due":
      return row.monthDue > 0;
    case "collected":
      return row.monthAllocated > 0;
    case "unpaid":
      return row.monthDue > row.monthAllocated;
    default:
      return true;
  }
}

export default function TenantStatusGrid({
  rows,
  monthLabel,
  emptyState,
  initialShow,
  id,
}: {
  rows: TenantMonthRow[];
  monthLabel: string;
  emptyState?: React.ReactNode;
  /** `?show=` from the URL; unknown values show everyone. */
  initialShow?: string;
  /** Anchor the dashboard cards jump to. */
  id?: string;
}) {
  const [filter, setFilter] = useState<MonthFilter>(
    MONTH_FILTERS.find((f) => f.value === initialShow)?.value ?? "all"
  );
  const filtered = useMemo(() => rows.filter((row) => matchesMonth(row, filter)), [rows, filter]);

  return (
    // scrollMarginTop keeps the table clear of the sticky top bar when a card jumps here.
    <Box id={id} sx={{ scrollMarginTop: 80 }}>
      <DataTable<TenantMonthRow>
        title="Tenants"
        subtitle={`Rent status for ${monthLabel}`}
        rows={filtered}
        totalCount={rows.length}
        filters={[{ label: "Show", value: filter, options: MONTH_FILTERS, onChange: setFilter, defaultValue: "all" }]}
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
    </Box>
  );
}

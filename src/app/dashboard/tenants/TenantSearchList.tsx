"use client";

import { useMemo, useState } from "react";
import type { GridColDef } from "@mui/x-data-grid";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import AppDataGrid from "@/components/AppDataGrid";
import {
  DashboardCardPanel,
  EmptyState,
  IdentityCell,
  PanelFilterSelect,
  StatusBadge,
  TagPill,
} from "@/components/DataComponents";
import { UnitCell } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { TenantSearchRow } from "@/lib/contracts";

type StatusFilter = "all" | "overdue" | "outstanding" | "settled";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All tenants" },
  { value: "overdue", label: "Overdue" },
  { value: "outstanding", label: "Has balance" },
  { value: "settled", label: "Settled" },
];

const columns: GridColDef<TenantSearchRow>[] = [
  {
    field: "displayName",
    headerName: "Tenant",
    flex: 1.4,
    minWidth: 200,
    // Include the contact name so the quick filter matches it too.
    valueGetter: (_value, row) => (row.contactName ? `${row.displayName} ${row.contactName}` : row.displayName),
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.displayName}
        caption={row.contactName ?? undefined}
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
  {
    field: "propertyAddress",
    headerName: "Location",
    flex: 1,
    minWidth: 160,
    valueFormatter: (value: string) => value || "—",
  },
  {
    field: "unitLabel",
    headerName: "Unit",
    flex: 1,
    minWidth: 180,
    valueGetter: (_value, row) => `${row.unitType} ${row.unitLabel}`,
    renderCell: ({ row }) => <UnitCell unitType={row.unitType} unitLabel={row.unitLabel} />,
  },
  {
    field: "totalOutstanding",
    headerName: "Outstanding",
    type: "number",
    minWidth: 190,
    flex: 1,
    headerAlign: "right",
    align: "right",
    // Delinquency order: months overdue first, then amount owed.
    sortComparator: (_v1, _v2, p1, p2) => {
      const a = p1.api.getRow(p1.id) as TenantSearchRow | null;
      const b = p2.api.getRow(p2.id) as TenantSearchRow | null;
      if (!a || !b) return 0;
      return a.overdueMonths - b.overdueMonths || a.totalOutstanding - b.totalOutstanding;
    },
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

function matchesStatus(row: TenantSearchRow, status: StatusFilter): boolean {
  switch (status) {
    case "overdue":
      return row.overdueMonths > 0;
    case "outstanding":
      return row.totalOutstanding > 0;
    case "settled":
      return row.totalOutstanding <= 0;
    default:
      return true;
  }
}

export default function TenantSearchList({ rows }: { rows: TenantSearchRow[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const filtered = useMemo(() => rows.filter((row) => matchesStatus(row, status)), [rows, status]);

  const statusFilter = (
    <PanelFilterSelect<StatusFilter>
      label="Status"
      value={status}
      options={STATUS_OPTIONS}
      onChange={setStatus}
    />
  );

  return (
    <DashboardCardPanel
      title="Active tenants"
      subtitle={`${filtered.length} of ${rows.length}`}
      action={rows.length > 0 ? statusFilter : undefined}
      flush
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<PeopleOutlineIcon />}
          title="No active tenants yet"
          description="Add a property and a tenant to start tracking rent."
        />
      ) : (
        <AppDataGrid<TenantSearchRow>
          rows={filtered}
          columns={columns}
          getRowId={(row) => row.tenantId}
          quickFilter
          label="Tenants"
          localeText={{ noRowsLabel: "No tenants match this filter." }}
          initialState={{ sorting: { sortModel: [{ field: "totalOutstanding", sort: "desc" }] } }}
        />
      )}
    </DashboardCardPanel>
  );
}

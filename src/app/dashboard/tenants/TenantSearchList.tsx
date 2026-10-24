"use client";

import { useMemo, useState } from "react";
import type { GridColDef } from "@mui/x-data-grid";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import DataTable from "@/components/ui/DataTable";
import { EmptyState, IdentityCell, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { UnitCell } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { TenantSearchRow } from "@/lib/contracts";

type StatusFilter = "current" | "drafts" | "overdue" | "outstanding" | "settled" | "movedOut" | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "current", label: "Current tenants" },
  { value: "drafts", label: "Drafts - details missing" },
  { value: "overdue", label: "Overdue" },
  { value: "outstanding", label: "Has balance" },
  { value: "settled", label: "Settled" },
  { value: "movedOut", label: "Moved out" },
  { value: "all", label: "Everyone" },
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
        caption={
          row.status === "active"
            ? (row.contactName ?? undefined)
            : row.status === "draft"
              ? "Draft - add phone, rent, lease start"
              : `Moved out ${row.movedOutOn ?? ""}`
        }
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
    field: "locationName",
    headerName: "Site",
    flex: 1,
    minWidth: 160,
    valueFormatter: (value: string) => value || "—",
  },
  {
    field: "unitCodes",
    headerName: "Houses",
    flex: 1,
    minWidth: 200,
    // Codes in the value so the quick filter finds a tenant by house number.
    valueGetter: (_value, row) => `${row.unitMix ?? ""} ${row.unitCodes.join(" ")}`,
    renderCell: ({ row }) => <UnitCell unitMix={row.unitMix} unitCodes={row.unitCodes} />,
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
  const current = row.status !== "inactive";
  switch (status) {
    case "current":
      return current;
    case "drafts":
      return row.status === "draft";
    case "overdue":
      return row.overdueMonths > 0;
    case "outstanding":
      return row.totalOutstanding > 0;
    case "settled":
      return current && row.totalOutstanding <= 0;
    case "movedOut":
      return !current;
    default:
      return true;
  }
}

export default function TenantSearchList({ rows }: { rows: TenantSearchRow[] }) {
  const [status, setStatus] = useState<StatusFilter>("current");
  const filtered = useMemo(() => rows.filter((row) => matchesStatus(row, status)), [rows, status]);

  return (
    <DataTable<TenantSearchRow>
      title="Tenants"
      rows={filtered}
      totalCount={rows.length}
      columns={columns}
      getRowId={(row) => row.tenantId}
      filters={[{ label: "Show", value: status, options: STATUS_OPTIONS, onChange: setStatus, defaultValue: "current" }]}
      search={{ placeholder: "Search tenant, house…" }}
      noRowsLabel="No tenants match this filter."
      initialState={{ sorting: { sortModel: [{ field: "totalOutstanding", sort: "desc" }] } }}
      emptyState={
        <EmptyState
          icon={<PeopleOutlineIcon />}
          title="No tenants yet"
          description="Open a tower under Properties and add a tenant to one or more of its houses."
        />
      }
    />
  );
}

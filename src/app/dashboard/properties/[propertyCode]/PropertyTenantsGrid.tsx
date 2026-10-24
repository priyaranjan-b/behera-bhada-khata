"use client";

import type { GridColDef } from "@mui/x-data-grid";
import DataTable, { moneyColumn } from "@/components/ui/DataTable";
import { IdentityCell, StatusBadge } from "@/components/ui/DataDisplay";
import { UnitCell } from "@/components/ui";
import type { PropertyTenantRow } from "@/lib/contracts";

const columns: GridColDef<PropertyTenantRow>[] = [
  {
    field: "displayName",
    headerName: "Tenant",
    flex: 1.4,
    minWidth: 200,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.displayName}
        caption={row.contactName ?? undefined}
        href={`/dashboard/tenants/${row.id}`}
      />
    ),
  },
  {
    field: "unitCodes",
    headerName: "Houses",
    flex: 1,
    minWidth: 180,
    valueGetter: (_v, row) => row.unitCodes.join(" "),
    renderCell: ({ row }) => <UnitCell unitMix={row.unitMix} unitCodes={row.unitCodes} />,
  },
  { field: "phone", headerName: "Phone", minWidth: 140, flex: 0.8 },
  moneyColumn<PropertyTenantRow>("monthlyRent", "Combined rent"),
  {
    field: "status",
    headerName: "Status",
    minWidth: 110,
    headerAlign: "right",
    align: "right",
    renderCell: ({ row }) =>
      row.status === "active" ? (
        <StatusBadge tone="success" label="Active" />
      ) : row.status === "draft" ? (
        <StatusBadge tone="warning" label="Draft" />
      ) : (
        <StatusBadge tone="neutral" label="Inactive" />
      ),
  },
];

export default function PropertyTenantsGrid({
  rows,
  propertyName,
  emptyState,
}: {
  rows: PropertyTenantRow[];
  propertyName: string;
  emptyState?: React.ReactNode;
}) {
  return (
    <DataTable<PropertyTenantRow>
      title="Tenants"
      subtitle={`Current tenants at ${propertyName}`}
      rows={rows}
      columns={columns}
      search={rows.length > 5 ? { placeholder: "Search tenant…" } : false}
      noRowsLabel="No tenants match."
      emptyState={emptyState}
    />
  );
}

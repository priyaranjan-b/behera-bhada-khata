"use client";

import type { GridColDef } from "@mui/x-data-grid";
import AppDataGrid, { moneyColumn } from "@/components/AppDataGrid";
import { IdentityCell, StatusBadge } from "@/components/DataComponents";
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
    field: "unitLabel",
    headerName: "Unit",
    flex: 1,
    minWidth: 180,
    renderCell: ({ row }) => <UnitCell unitType={row.unitType} unitLabel={row.unitLabel} />,
  },
  { field: "phone", headerName: "Phone", minWidth: 140, flex: 0.8 },
  moneyColumn<PropertyTenantRow>("monthlyRent", "Monthly rent"),
  {
    field: "status",
    headerName: "Status",
    minWidth: 110,
    headerAlign: "right",
    align: "right",
    renderCell: ({ row }) =>
      row.status === "active" ? (
        <StatusBadge tone="success" label="Active" />
      ) : (
        <StatusBadge tone="neutral" label="Inactive" />
      ),
  },
];

export default function PropertyTenantsGrid({ rows, propertyName }: { rows: PropertyTenantRow[]; propertyName: string }) {
  return (
    <AppDataGrid<PropertyTenantRow>
      rows={rows}
      columns={columns}
      quickFilter={rows.length > 5}
      label={`Tenants at ${propertyName}`}
    />
  );
}

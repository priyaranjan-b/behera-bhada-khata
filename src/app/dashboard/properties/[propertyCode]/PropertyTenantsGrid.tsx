"use client";

import DataTable, { moneyColumn, type DataTableColDef } from "@/components/ui/DataTable";
import { IdentityCell } from "@/components/ui/DataDisplay";
import TenantStatusBadge from "@/components/domain/TenantStatusBadge";
import { UnitCell } from "@/components/ui";
import type { PropertyTenantRow } from "@/lib/contracts";
import { TENANT_STATUS_DISPLAY, tenantKindTags } from "@/lib/domain/tenant";
import type { TenantStatus } from "@/lib/types";
import { routes } from "@/lib/routes";

const columns: DataTableColDef<PropertyTenantRow>[] = [
  {
    field: "displayName",
    headerName: "Tenant",
    flex: 1.4,
    minWidth: 200,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.displayName}
        caption={[...tenantKindTags(row), row.contactName].filter(Boolean).join(" · ") || undefined}
        href={routes.tenants.detail(row.id)}
      />
    ),
  },
  {
    field: "unitCodes",
    headerName: "Houses",
    flex: 1,
    minWidth: 180,
    valueGetter: (_v, row) => row.unitCodes.join(" "),
    exportValue: (row) => row.unitCodes.join(", "),
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
    valueFormatter: (value: TenantStatus) => TENANT_STATUS_DISPLAY[value].label,
    renderCell: ({ row }) => <TenantStatusBadge status={row.status} />,
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

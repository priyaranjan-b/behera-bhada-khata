"use client";

import type { GridColDef } from "@mui/x-data-grid";
import AppDataGrid, { moneyColumn } from "@/components/ui/AppDataGrid";
import { StatusChip } from "@/components/domain/StatusChip";
import type { TenantPeriod } from "@/lib/contracts";

export interface TenantPeriodRow extends TenantPeriod {
  monthLabel: string;
}

const columns: GridColDef<TenantPeriodRow>[] = [
  {
    field: "periodMonth",
    headerName: "Month",
    flex: 1,
    minWidth: 150,
    // Label is formatted on the server so it can't differ at hydration.
    valueFormatter: (_value, row) => row.monthLabel,
  },
  moneyColumn<TenantPeriodRow>("amountDue", "Due"),
  moneyColumn<TenantPeriodRow>("amountAllocated", "Allocated"),
  {
    field: "status",
    headerName: "Status",
    minWidth: 140,
    headerAlign: "right",
    align: "right",
    renderCell: ({ row }) => <StatusChip status={row.status} />,
  },
];

export default function TenantPeriodsGrid({ rows }: { rows: TenantPeriodRow[] }) {
  return (
    <AppDataGrid<TenantPeriodRow>
      rows={rows}
      columns={columns}
      label="Rent by month"
      localeText={{ noRowsLabel: "No months billed yet." }}
      initialState={{ sorting: { sortModel: [{ field: "periodMonth", sort: "desc" }] } }}
    />
  );
}

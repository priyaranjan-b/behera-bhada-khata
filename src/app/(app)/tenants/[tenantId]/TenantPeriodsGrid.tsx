"use client";

import type { GridColDef } from "@mui/x-data-grid";
import DataTable, { moneyColumn } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/domain/StatusChip";
import type { TenantPeriod } from "@/lib/contracts";
import { periodDisplayStatus } from "@/lib/domain/billing";
import { statusLabel } from "@/lib/domain/status";

export interface TenantPeriodRow extends TenantPeriod {
  monthLabel: string;
  /** This month or later: billed ahead, not owed until the month ends (set on the server). */
  notYetDue: boolean;
}

const periodStatus = (row: TenantPeriodRow) => periodDisplayStatus(row.status, row.notYetDue);

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
    valueFormatter: (_value, row) => statusLabel(periodStatus(row)),
    renderCell: ({ row }) => <StatusChip status={periodStatus(row)} />,
  },
];

export default function TenantPeriodsGrid({ rows }: { rows: TenantPeriodRow[] }) {
  return (
    <DataTable<TenantPeriodRow>
      title="Months"
      subtitle="Rent owed and allocated per month"
      rows={rows}
      columns={columns}
      rowDensity="dense"
      search={false}
      noRowsLabel="No months billed yet."
      initialState={{ sorting: { sortModel: [{ field: "periodMonth", sort: "desc" }] } }}
    />
  );
}

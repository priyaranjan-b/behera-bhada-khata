"use client";

import DataTable, { moneyColumn, type DataTableColDef } from "@/components/ui/DataTable";
import type { EarningsMonth } from "@/lib/domain/earnings";

// One row per month: at most EARNINGS_LIMITS.maxMonths (24), so the table
// pages and sorts in the browser (A23, an exception to A15's "grows every
// month" rule: the rows are monthly totals with a fixed cap).
const columns: DataTableColDef<EarningsMonth>[] = [
  { field: "label", headerName: "Month", minWidth: 110, sortable: false, filterable: false },
  moneyColumn<EarningsMonth>("billed", "Billed"),
  moneyColumn<EarningsMonth>("collected", "Collected"),
  moneyColumn<EarningsMonth>("received", "Received (cash)"),
  moneyColumn<EarningsMonth>("maintenance", "Maintenance"),
  moneyColumn<EarningsMonth>("maintenanceCash", "Of it, in cash"),
  moneyColumn<EarningsMonth>("netCollected", "Net (rent month)"),
  moneyColumn<EarningsMonth>("netCash", "Net cash"),
  {
    field: "expenseRatio",
    headerName: "Spent of collected",
    type: "number",
    minWidth: 130,
    valueFormatter: (value: number | null) => (value == null ? "—" : `${value}%`),
    exportValue: (row) => row.expenseRatio,
  },
];

const getRowId = (row: EarningsMonth) => row.monthKey;

/** The months as a table, with Excel export. */
export default function EarningsTable({ months, rangeLabel }: { months: EarningsMonth[]; rangeLabel: string }) {
  return (
    <DataTable<EarningsMonth>
      title="By month"
      subtitle={rangeLabel}
      rows={months}
      columns={columns}
      getRowId={getRowId}
      pageSize={25}
      rowDensity="dense"
      filterButton={false}
      noRowsLabel="No months."
    />
  );
}

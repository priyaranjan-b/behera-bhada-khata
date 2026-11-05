"use client";

import DataTable, { moneyColumn, type DataTableColDef } from "@/components/ui/DataTable";
import type { EarningsMonth } from "@/lib/domain/earnings";

// One row per month: at most EARNINGS_LIMITS.maxMonths (24), so the table
// pages and sorts in the browser (A23, an exception to A15's "grows every
// month" rule: the rows are monthly totals with a fixed cap). The footer adds
// up every money column: the range's totals (A26).
const columns: DataTableColDef<EarningsMonth>[] = [
  { field: "label", headerName: "Month", minWidth: 110, sortable: false, filterable: false },
  moneyColumn<EarningsMonth>("billed", "Billed", { total: true }),
  moneyColumn<EarningsMonth>("collected", "Collected", { total: true }),
  moneyColumn<EarningsMonth>("received", "Received (cash)", { total: true }),
  moneyColumn<EarningsMonth>("maintenance", "Maintenance", { total: true }),
  moneyColumn<EarningsMonth>("maintenanceCash", "Of it, in cash", { total: true }),
  moneyColumn<EarningsMonth>("netCollected", "Net (rent month)", { total: true }),
  moneyColumn<EarningsMonth>("netCash", "Net cash", { total: true }),
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

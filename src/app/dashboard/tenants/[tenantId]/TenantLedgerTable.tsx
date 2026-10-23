"use client";

import { useMemo, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { GridColDef } from "@mui/x-data-grid";
import type { LedgerRow } from "@/lib/tenantLedger";
import AppDataGrid, { moneyColumn } from "@/components/AppDataGrid";
import { DashboardCardPanel, PanelFilterSelect } from "@/components/DataComponents";
import { GridCell } from "@/components/ui";
import { StatusChip } from "@/components/StatusChip";
import ResendButton from "@/components/ResendButton";
import Link from "@/components/Link";
import { apiHref, apiPaths } from "@/lib/api-client";

type FilterMode = "all" | "range" | "month";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "range", label: "Date range" },
  { value: "month", label: "Month" },
];

const TYPE_LABEL: Record<LedgerRow["type"], string> = {
  charge: "Charge",
  payment: "Payment",
  adjustment: "Adjustment",
};

function ActionsCell({ row, tenantId }: { row: LedgerRow; tenantId: string }) {
  if (row.type === "charge" || !row.refId) return null;
  if (row.status === "confirmed") {
    return (
      <GridCell align="end">
        <Button
          size="small"
          href={apiHref(
            row.type === "payment"
              ? apiPaths.dashboard.payments.receipt(row.refId)
              : apiPaths.dashboard.adjustments.receipt(row.refId)
          )}
        >
          Receipt
        </Button>
        {row.type === "payment" ? (
          <Button size="small" component={Link} href={`/dashboard/payments/${row.refId}/adjust`}>
            Adjust
          </Button>
        ) : null}
      </GridCell>
    );
  }
  return (
    <GridCell align="end">
      <ResendButton
        kind={row.type === "payment" ? "payment" : "adjustment"}
        recordId={row.refId}
        tenantId={tenantId}
        amount={row.rawAmount ?? 0}
      />
    </GridCell>
  );
}

function blankZero(value: number | null | undefined) {
  return value ? value : null;
}

export default function TenantLedgerTable({ rows, tenantId }: { rows: LedgerRow[]; tenantId: string }) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [month, setMonth] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filterMode === "month") {
        if (!month) return true;
        return row.date.slice(0, 7) === month;
      }
      if (filterMode === "range") {
        if (fromDate && row.date < fromDate) return false;
        if (toDate && row.date > toDate) return false;
      }
      return true;
    });
  }, [rows, filterMode, fromDate, toDate, month]);

  // Rows arrive in ledger order (the order the running balance was built in);
  // same-day entries keep that order instead of whatever the grid's sort yields.
  const ledgerOrder = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows]);

  const columns = useMemo<GridColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        minWidth: 110,
        flex: 0.6,
        sortComparator: (a: string, b: string, p1, p2) =>
          a.localeCompare(b) || (ledgerOrder.get(String(p1.id)) ?? 0) - (ledgerOrder.get(String(p2.id)) ?? 0),
      },
      {
        field: "description",
        headerName: "Description",
        flex: 1.4,
        minWidth: 200,
        renderCell: ({ row }) => (
          <GridCell direction="column" spacing={0}>
            <Typography variant="body2" noWrap>
              {row.description}
            </Typography>
            <Typography variant="caption" color="textSecondary" noWrap>
              {TYPE_LABEL[row.type]}
            </Typography>
          </GridCell>
        ),
      },
      {
        field: "status",
        headerName: "Status",
        minWidth: 120,
        renderCell: ({ row }) =>
          row.status === "billed" ? (
            <Typography variant="caption" color="textSecondary">
              —
            </Typography>
          ) : (
            <StatusChip status={row.status} />
          ),
      },
      moneyColumn<LedgerRow>("debit", "Debit", { valueGetter: blankZero }),
      moneyColumn<LedgerRow>("credit", "Credit", { valueGetter: blankZero }),
      moneyColumn<LedgerRow>("balance", "Balance"),
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        minWidth: 180,
        headerAlign: "right",
        align: "right",
        renderCell: ({ row }) => <ActionsCell row={row} tenantId={tenantId} />,
      },
    ],
    [tenantId, ledgerOrder]
  );

  function resetFilters(mode: FilterMode) {
    setFilterMode(mode);
    setFromDate("");
    setToDate("");
    setMonth("");
  }

  const filterSelect = (
    <PanelFilterSelect<FilterMode>
      label="Filter"
      value={filterMode}
      options={FILTER_OPTIONS}
      onChange={resetFilters}
    />
  );

  const dateInputs =
    filterMode !== "all" ? (
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {filterMode === "range" ? (
          <>
            <TextField
              label="From"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        ) : (
          <TextField
            label="Month"
            type="month"
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
      </Stack>
    ) : undefined;

  return (
    <DashboardCardPanel
      title="Ledger"
      subtitle="Charges, payments and corrections"
      action={filterSelect}
      toolbar={dateInputs}
      flush
    >
      <AppDataGrid<LedgerRow>
        rows={filtered}
        columns={columns}
        pageSize={10}
        label="Tenant ledger"
        localeText={{ noRowsLabel: "No entries match this filter." }}
        initialState={{ sorting: { sortModel: [{ field: "date", sort: "desc" }] } }}
      />
    </DashboardCardPanel>
  );
}

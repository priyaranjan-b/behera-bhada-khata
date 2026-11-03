"use client";

import { useCallback } from "react";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  moneyColumn,
  SERVER_TEXT_OPERATORS,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, IdentityCell } from "@/components/ui/DataDisplay";
import StatCard from "@/components/ui/StatCard";
import { api } from "@/lib/api-client";
import { apiHref, apiPaths } from "@/lib/api-client/paths";
import type { PaymentListRow, PaymentsPage, PaymentsPageQuery, PaymentTotals } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { paymentModeLabel, type DayRange } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { PAYMENT_STAT_CELL } from "./paymentStatCell";

const columns: DataTableColDef<PaymentListRow>[] = [
  {
    field: "paymentDate",
    headerName: "Date received",
    minWidth: 130,
    valueFormatter: (value: string) => formatDateKey(value),
    exportValue: (row) => formatDateKey(row.paymentDate),
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  {
    field: "receiptNo",
    headerName: "Receipt",
    minWidth: 130,
    filterOperators: SERVER_TEXT_OPERATORS,
    renderCell: ({ row }) => (
      <MuiLink
        href={apiHref(apiPaths.dashboard.payments.receipt(row.id))}
        aria-label={`Receipt ${row.receiptNo ?? ""} for ${row.tenantName}`}
      >
        {row.receiptNo ?? "Receipt"}
      </MuiLink>
    ),
  },
  {
    field: "tenantName",
    headerName: "Tenant",
    flex: 1.2,
    minWidth: 200,
    filterOperators: SERVER_TEXT_OPERATORS,
    renderCell: ({ row }) => (
      <IdentityCell name={row.tenantName} caption={row.propertyName} href={routes.tenants.detail(row.tenantId)} />
    ),
  },
  {
    field: "mode",
    headerName: "Mode",
    minWidth: 120,
    valueGetter: (_value, row) => paymentModeLabel(row.mode),
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  moneyColumn<PaymentListRow>("amount", "Amount", { filterable: false }),
  {
    field: "monthsText",
    headerName: "For months",
    flex: 1.2,
    minWidth: 180,
    sortable: false,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  {
    field: "note",
    headerName: "Note",
    flex: 1,
    minWidth: 160,
    sortable: false,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
];

const DEFAULT_EXTRA = {};
const DEFAULT_SORT: GridSortModel = [{ field: "paymentDate", sort: "desc" }];
const getRowId = (row: PaymentListRow) => row.id;
const toQuery = (grid: GridQueryParams): PaymentsPageQuery => grid;

/** "32% of received", or nothing when nothing was received. */
const shareOf = (part: number, totals: PaymentTotals) =>
  totals.amount > 0 ? `${Math.round((part / totals.amount) * 100)}% of received` : "Nothing received";

/**
 * Every tenant's payments in the days, one page at a time: paging, sort,
 * search and filters run in the database (A15), and the cards add up
 * every payment the search and filters find, whatever the page.
 */
export default function PaymentsView({
  initial,
  range,
  rangeLabel,
  paidDirectCard,
}: {
  initial: PaymentsPage;
  range: DayRange;
  rangeLabel: string;
  paidDirectCard: React.ReactNode;
}) {
  const { from, to } = range;
  const load = useCallback((q: PaymentsPageQuery) => api.dashboard.payments.list({ from, to, ...q }), [from, to]);
  const { data, error, gridProps } = useServerGrid({
    initial,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the payments.",
  });
  const { totals } = data;
  const narrowed = data.total < data.all;
  const byMode = totals.byMode;

  return (
    <Stack spacing={2}>
      <Grid container spacing={2} columns={12}>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard
            title="Received"
            value={formatMoney(totals.amount)}
            caption={`${totals.count} payment${totals.count === 1 ? "" : "s"}${narrowed ? " matching the search" : ""}`}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard title="Cash" value={formatMoney(byMode.cash)} caption={shareOf(byMode.cash, totals)} />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard title="UPI" value={formatMoney(byMode.upi)} caption={shareOf(byMode.upi, totals)} />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard
            title="Bank transfer"
            value={formatMoney(byMode.bank_transfer)}
            caption={shareOf(byMode.bank_transfer, totals)}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard
            title="Cheque & other"
            value={formatMoney(byMode.cheque + byMode.other)}
            caption={shareOf(byMode.cheque + byMode.other, totals)}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>{paidDirectCard}</Grid>
      </Grid>

      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<PaymentListRow>
        title="Payments received"
        subtitle={rangeLabel}
        rows={data.rows}
        {...gridProps}
        columns={columns}
        getRowId={getRowId}
        search={{ placeholder: "Search tenant, receipt, note…" }}
        rowDensity="standard"
        noRowsLabel="No payments match."
        emptyState={
          <EmptyState
            icon={<PaymentsRoundedIcon />}
            title="No payments received in these days"
            description="Payments show here by the day they were received."
          />
        }
      />
    </Stack>
  );
}

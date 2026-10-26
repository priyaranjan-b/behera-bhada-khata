"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  moneyColumn,
  SERVER_TEXT_OPERATORS,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, IdentityCell } from "@/components/ui/DataDisplay";
import { StatusChip } from "@/components/domain/StatusChip";
import { api } from "@/lib/api-client";
import { apiHref, apiPaths } from "@/lib/api-client/paths";
import type { BillingPage, BillingPageQuery, BillingQuery, BillingRow } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import { BILLING_SHOW_OPTIONS, periodDisplayStatus, type BillingShow } from "@/lib/domain/billing";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { paymentModeLabel } from "@/lib/domain/payments";
import { statusLabel } from "@/lib/domain/status";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";

const displayStatus = (row: BillingRow) =>
  row.paidDirect
    ? "paid_direct"
    : periodDisplayStatus(row.status, row.notYetDue);

const PAID_DIRECT_TEXT = "Paid to your bank directly";

const receiptText = (row: BillingRow) =>
  row.paidDirect
    ? PAID_DIRECT_TEXT
    : row.payments
        .map((p) => `${p.receiptNo ?? "—"} (${formatDateKey(p.paymentDate)})`)
        .join(", ");

const columns: DataTableColDef<BillingRow>[] = [
  {
    field: "periodMonth",
    headerName: "Month",
    minWidth: 140,
    flex: 0.7,
    valueFormatter: (_value, row) => row.monthLabel,
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  {
    field: "tenantName",
    headerName: "Tenant",
    flex: 1.3,
    minWidth: 200,
    filterOperators: SERVER_TEXT_OPERATORS,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.tenantName}
        caption={row.propertyName}
        href={routes.tenants.detail(row.tenantId)}
      />
    ),
  },
  moneyColumn<BillingRow>("amountDue", "Billed", { filterable: false }),
  moneyColumn<BillingRow>("amountAllocated", "Collected", { filterable: false }),
  moneyColumn<BillingRow>("balance", "Balance", { filterable: false }),
  {
    field: "status",
    headerName: "Status",
    minWidth: 130,
    valueGetter: (_value, row) => statusLabel(displayStatus(row)),
    // Sorted in SQL by need (unpaid, partly paid, not due, paid, paid direct), then balance.
    filterOperators: SERVER_TEXT_OPERATORS,
    renderCell: ({ row }) => <StatusChip status={displayStatus(row)} />,
  },
  {
    field: "payments",
    headerName: "Paid by",
    flex: 1.4,
    minWidth: 230,
    sortable: false,
    filterOperators: SERVER_TEXT_OPERATORS,
    valueGetter: (_value, row) => receiptText(row),
    exportValue: (row) => receiptText(row),
    renderCell: ({ row }) =>
      row.paidDirect ? (
        <Typography variant="caption" color="textSecondary">
          {PAID_DIRECT_TEXT}
        </Typography>
      ) : row.payments.length === 0 ? (
        "—"
      ) : (
        <Stack spacing={0.25} sx={{ py: 0.5 }}>
          {row.payments.map((p) => (
            <Typography
              key={p.paymentId}
              variant="caption"
              component="div"
              noWrap
            >
              <MuiLink
                href={apiHref(apiPaths.dashboard.payments.receipt(p.paymentId))}
                aria-label={`Receipt ${p.receiptNo ?? ""} for ${row.tenantName}`}
              >
                {p.receiptNo ?? "Receipt"}
              </MuiLink>
              {` · ${formatDateKey(p.paymentDate)} · ${paymentModeLabel(p.mode)} · ${formatMoney(p.amount)}`}
            </Typography>
          ))}
        </Stack>
      ),
  },
];

interface Extra {
  show: BillingShow;
}

const DEFAULT_EXTRA: Extra = { show: "all" };
const DEFAULT_SORT: GridSortModel = [{ field: "amountAllocated", sort: "desc" }];
const getRowId = (row: BillingRow) => row.id;
const toQuery = (grid: GridQueryParams, extra: Extra): BillingPageQuery => ({ ...grid, show: extra.show });

/**
 * Every tenant's rent for each month in the range, with what paid it - one
 * page at a time: paging, sort, search and "Show" run in SQL (billing_page,
 * A15). The range and the paid-direct view come from the page.
 */
export default function BillingGrid({
  initial,
  query,
  rangeLabel,
}: {
  initial: BillingPage;
  query: BillingQuery;
  rangeLabel: string;
}) {
  const { from, to, paidDirect } = query;
  const load = useCallback(
    (q: BillingPageQuery) => api.dashboard.billing({ from, to, paidDirect, ...q }),
    [from, to, paidDirect]
  );
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    initial,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the billing months.",
  });
  const filters = useMemo(
    () => [
      {
        label: "Show",
        value: extra.show,
        options: BILLING_SHOW_OPTIONS,
        onChange: (show: BillingShow) => setExtra({ show }),
        defaultValue: "all" as BillingShow,
      },
    ],
    [extra.show, setExtra]
  );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<BillingRow>
        title="Billing & collection"
        subtitle={`Rent per tenant per month, ${rangeLabel}`}
        rows={data.rows}
        {...gridProps}
        filters={filters}
        columns={columns}
        getRowId={getRowId}
        search={{ placeholder: "Search tenant or receipt…" }}
        rowDensity="standard"
        noRowsLabel="No months match."
        emptyState={
          <EmptyState
            icon={<ReceiptLongRoundedIcon />}
            title="Nothing billed in these months"
            description="Rent months appear here once a tenant is billed for them."
          />
        }
      />
    </Stack>
  );
}

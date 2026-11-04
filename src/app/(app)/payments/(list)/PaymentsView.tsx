"use client";

import { useCallback, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LocalAtmRoundedIcon from "@mui/icons-material/LocalAtmRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  moneyColumn,
  selectColumn,
  SERVER_TEXT_OPERATORS,
  tagsColumn,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, IdentityCell } from "@/components/ui/DataDisplay";
import { TagsCell } from "@/components/ui/GridCells";
import StatCard from "@/components/ui/StatCard";
import { api } from "@/lib/api-client";
import { apiHref, apiPaths } from "@/lib/api-client/paths";
import type { PaymentListRow, PaymentsPage, PaymentsPageQuery, PaymentTotals } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { PAYMENT_MODE_OPTIONS, paymentModeLabel, type DayRange } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import EditTagsDialog from "@/components/domain/EditTagsDialog";
import { PAYMENT_STAT_CELL } from "./paymentStatCell";

const tagsOf = (row: PaymentListRow) => row.tags;
/** The database filters on the label the column shows. */
const MODE_LABELS = PAYMENT_MODE_OPTIONS.map((o) => o.label);

const baseColumns: DataTableColDef<PaymentListRow>[] = [
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
  selectColumn<PaymentListRow>("mode", "Mode", MODE_LABELS, {
    minWidth: 120,
    valueGetter: (_value, row) => paymentModeLabel(row.mode),
  }),
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

/** The Tags column (filtered by the tag suggestions) with an edit button per row, which opens the tag editor for that payment. */
function columnsWithTags(
  tagOptions: readonly string[],
  onEdit: (row: PaymentListRow) => void
): DataTableColDef<PaymentListRow>[] {
  return [
    ...baseColumns,
    tagsColumn<PaymentListRow>("tags", "Tags", tagsOf, tagOptions, {
      minWidth: 200,
      renderCell: ({ row }) => (
        <TagsCell
          tags={row.tags}
          action={
            <IconButton
              size="small"
              aria-label={`Edit tags of receipt ${row.receiptNo ?? ""} for ${row.tenantName}`}
              onClick={() => onEdit(row)}
            >
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          }
        />
      ),
    }),
  ];
}

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
  tagSuggestions,
}: {
  initial: PaymentsPage;
  range: DayRange;
  rangeLabel: string;
  paidDirectCard: React.ReactNode;
  /** Suggested tag names for the tag editor (Settings). */
  tagSuggestions: string[];
}) {
  const { from, to } = range;
  const [editing, setEditing] = useState<PaymentListRow | null>(null);
  const [suggestions, setSuggestions] = useState(tagSuggestions);
  const columns = useMemo(() => columnsWithTags(suggestions, setEditing), [suggestions]);
  const load = useCallback((q: PaymentsPageQuery) => api.dashboard.payments.list({ from, to, ...q }), [from, to]);
  const { data, error, reload, gridProps } = useServerGrid({
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
            icon={<PaymentsRoundedIcon />}
            tone="primary"
            variant="gradient"
            value={formatMoney(totals.amount)}
            caption={`${totals.count} payment${totals.count === 1 ? "" : "s"}${narrowed ? " matching the search" : ""}${
              byMode.set_off > 0 ? ` · + ${formatMoney(byMode.set_off)} set off` : ""
            }`}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard title="Cash" icon={<LocalAtmRoundedIcon />} value={formatMoney(byMode.cash)} caption={shareOf(byMode.cash, totals)} />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard title="UPI" icon={<QrCode2RoundedIcon />} value={formatMoney(byMode.upi)} caption={shareOf(byMode.upi, totals)} />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard
            title="Bank transfer"
            icon={<AccountBalanceRoundedIcon />}
            value={formatMoney(byMode.bank_transfer)}
            caption={shareOf(byMode.bank_transfer, totals)}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard
            title="Cheque & other"
            icon={<DescriptionRoundedIcon />}
            value={formatMoney(byMode.cheque + byMode.other)}
            caption={shareOf(byMode.cheque + byMode.other, totals)}
          />
        </Grid>
        <Grid size={PAYMENT_STAT_CELL}>
          <StatCard title="Set-off" icon={<SwapHorizRoundedIcon />} value={formatMoney(byMode.set_off)} caption="Not cash · kept back by tenants" />
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
        search={{ placeholder: "Search tenant, receipt, note, tag…" }}
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
      {editing ? (
        <EditTagsDialog
          key={editing.id}
          title="Payment tags"
          summary={`${editing.tenantName} · ${formatMoney(editing.amount)} on ${formatDateKey(editing.paymentDate)}${
            editing.receiptNo ? ` · #${editing.receiptNo}` : ""
          }`}
          tags={editing.tags}
          suggestions={suggestions}
          save={async (tags) => (await api.dashboard.payments.setTags(editing.id, { tags })).tags}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            // A new name now shows among the suggestions, as on the server.
            setSuggestions((known) => {
              const added = saved.filter((t) => !known.some((k) => k.toLowerCase() === t.toLowerCase()));
              return added.length > 0 ? [...known, ...added].sort((a, b) => a.localeCompare(b)) : known;
            });
            void reload();
          }}
        />
      ) : null}
    </Stack>
  );
}

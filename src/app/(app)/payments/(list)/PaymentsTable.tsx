"use client";

import { use, useCallback, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
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
import { LoadingButton } from "@/components/ui/Loading";
import { api } from "@/lib/api-client";
import { apiHref, apiPaths } from "@/lib/api-client/paths";
import type { PaymentListRow, PaymentsPage, PaymentsPageQuery } from "@/lib/contracts";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { PAYMENT_MODE_OPTIONS, paymentModeLabel, type DayRange } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import EditTagsDialog from "@/components/domain/EditTagsDialog";
import { useDates } from "@/components/ui/useDates";

const tagsOf = (row: PaymentListRow) => row.tags;
/** The database filters on the label the column shows. */
const MODE_LABELS = PAYMENT_MODE_OPTIONS.map((o) => o.label);

const baseColumns: DataTableColDef<PaymentListRow>[] = [
  {
    field: "paymentDate",
    headerName: "Date received",
    minWidth: 130,
    dateKind: "date",
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
  moneyColumn<PaymentListRow>("amount", "Amount", { filterable: false, total: true }),
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
/**
 * Until the first page arrives from the browser's call (the grid shows skeleton
 * rows meanwhile). Its `from`/`to` are placeholders, never read.
 */
const EMPTY_PAGE: PaymentsPage = { from: "", to: "", rows: [], total: 0, all: 0, page: 0, totals: { amount: 0 }, setOff: 0 };
const DEFAULT_SORT: GridSortModel = [{ field: "paymentDate", sort: "desc" }];
const getRowId = (row: PaymentListRow) => row.id;
const toQuery = (grid: GridQueryParams): PaymentsPageQuery => grid;

/**
 * The Payments table's state: the browser loads each page over the API and
 * paging, sort, search and filters run in the database (A15). Held by
 * PaymentsView, so the stat cards can set its Mode filter (A28).
 */
export function usePaymentsGrid({ from, to }: DayRange) {
  const load = useCallback((q: PaymentsPageQuery) => api.dashboard.payments.list({ from, to, ...q }), [from, to]);
  return useServerGrid({
    empty: EMPTY_PAGE,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the payments.",
  });
}

type PaymentsGrid = ReturnType<typeof usePaymentsGrid>;

/**
 * Every tenant's payments in the days, one page at a time, with the tag
 * editor. Suspends on the tag suggestions only (its own AsyncSection), so the
 * stat cards above never wait for them.
 */
export default function PaymentsTable({
  grid,
  rangeLabel,
  tagSuggestions,
}: {
  grid: PaymentsGrid;
  rangeLabel: string;
  /** Suggested tag names for the Tags column and the tag editor (Settings). */
  tagSuggestions: Promise<string[]>;
}) {
  const { formatDate } = useDates();
  const { data, error, reload, gridProps } = grid;
  const [editing, setEditing] = useState<PaymentListRow | null>(null);
  const [suggestions, setSuggestions] = useState(use(tagSuggestions));
  const columns = useMemo(() => columnsWithTags(suggestions, setEditing), [suggestions]);
  // No page has arrived yet: say the load failed, with a retry, instead of "no payments" next to the cards' money.
  const failedFirstLoad = error !== null && data === EMPTY_PAGE;

  return (
    <>
      {error && !failedFirstLoad ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<PaymentListRow>
        title="Payments received"
        subtitle={rangeLabel}
        rows={data.rows}
        // Every matching row, set-offs included; "Received" above is cash only (A22, A26).
        columnTotals={data.totals}
        totalsNote={data.setOff > 0 ? `incl. ${formatMoney(data.setOff)} set off, not cash` : undefined}
        {...gridProps}
        columns={columns}
        getRowId={getRowId}
        search={{ placeholder: "Search tenant, receipt, note, tag…" }}
        rowDensity="standard"
        noRowsLabel="No payments match."
        emptyState={
          failedFirstLoad ? (
            <EmptyState
              icon={<ErrorOutlineRoundedIcon />}
              title="Couldn't load the payments"
              description={error}
              action={
                <LoadingButton variant="outlined" size="small" onClick={() => reload()}>
                  Try again
                </LoadingButton>
              }
            />
          ) : (
            <EmptyState
              icon={<PaymentsRoundedIcon />}
              title="No payments received in these days"
              description="Payments show here by the day they were received."
            />
          )
        }
      />
      {editing ? (
        <EditTagsDialog
          key={editing.id}
          title="Payment tags"
          summary={`${editing.tenantName} · ${formatMoney(editing.amount)} on ${formatDate(editing.paymentDate)}${
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
    </>
  );
}

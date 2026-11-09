"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import type { GridSortModel } from "@mui/x-data-grid";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { LEDGER_SHOW_OPTIONS, LEDGER_STATUS_LABELS, type LedgerRow, type LedgerShow } from "@/lib/domain/tenantLedger";
import type { TenantLedgerQuery, TenantLedgerView } from "@/lib/contracts";
import { formatDateKey, formatDayRange, formatMonth, monthDayRange, monthKeyOf } from "@/lib/dates";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import DataTable, {
  moneyColumn,
  selectColumn,
  SERVER_TEXT_OPERATORS,
  tagsColumn,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { DateField, GridCell, MonthField } from "@/components/ui";
import { StatusChip } from "@/components/domain/StatusChip";
import ResendButton from "@/components/domain/ResendButton";
import ProofsButton from "@/components/domain/ProofsButton";
import TenantReceiptActions from "@/components/domain/TenantReceiptActions";
import { orTenantSignIn } from "@/components/domain/tenantSignedOut";
import { formatMoney } from "@/lib/money";
import ShareReceiptButton from "@/components/domain/ShareReceiptButton";
import { api, apiHref, apiPaths } from "@/lib/api-client";
import { routes } from "@/lib/routes";
import LinkButton from "@/components/ui/Loading/LinkButton";

type FilterMode = "all" | "range" | "month";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "range", label: "Date range" },
  { value: "month", label: "Month" },
];

interface Extra {
  /** "Credits only" by default: what the owner opens the ledger for is what came in. */
  show: LedgerShow;
  mode: FilterMode;
  from: string;
  to: string;
  /** yyyy-MM, from the MonthField. */
  month: string;
}

const DEFAULT_EXTRA: Extra = { show: "credits", mode: "all", from: "", to: "", month: "" };
const DEFAULT_SORT: GridSortModel = [{ field: "date", sort: "desc" }];
const EMPTY: TenantLedgerView = {
  rows: [],
  total: 0,
  all: 0,
  page: 0,
  tenantMessaging: false,
  totals: { debit: 0, credit: 0 },
  uncountedRows: 0,
};

function toQuery(grid: GridQueryParams, extra: Extra): TenantLedgerQuery {
  const base = { ...grid, show: extra.show };
  if (extra.mode === "month" && extra.month) return { ...base, ...monthDayRange(extra.month) };
  if (extra.mode === "range") return { ...base, from: extra.from || undefined, to: extra.to || undefined };
  return base;
}

/** Whose ledger API the table reads: the owner's for one tenant, or the signed-in tenant's own (the portal, A32). */
export type TenantLedgerSource = { source: "owner"; tenantId: string } | { source: "tenant" };

// Every payment/adjustment counts once recorded (0010): its receipt can be
// downloaded straight away (e.g. to send on WhatsApp), and the tenant can be
// sent a link to acknowledge it until they have.
function ActionsCell({ row, tenantId, tenantMessaging }: { row: LedgerRow; tenantId: string; tenantMessaging: boolean }) {
  if (row.type === "charge" || !row.refId) return null;
  const receiptHref = apiHref(
    row.type === "payment"
      ? apiPaths.dashboard.payments.receipt(row.refId)
      : apiPaths.dashboard.adjustments.receipt(row.refId)
  );
  return (
    <GridCell align="end">
      {row.type === "payment" ? <ProofsButton paymentId={row.refId} proofs={row.proofs ?? []} /> : null}
      <Button size="small" startIcon={<DownloadRoundedIcon />} href={receiptHref} download>
        Receipt
      </Button>
      <ShareReceiptButton href={receiptHref} receiptNo={row.receiptNo} />
      {row.type === "payment" && row.status === "confirmed" ? (
        <LinkButton size="small" href={routes.payments.adjust(row.refId)}>
          Adjust
        </LinkButton>
      ) : null}
      {row.acknowledged || !tenantMessaging ? null : (
        <ResendButton kind={row.type === "payment" ? "payment" : "adjustment"} recordId={row.refId} tenantId={tenantId} />
      )}
    </GridCell>
  );
}

const ledgerTagsOf = (row: LedgerRow) => row.tags ?? [];
/** The database filters on the label the column shows; a plain charge has none. */
const LEDGER_STATUS_OPTIONS = Object.values(LEDGER_STATUS_LABELS).filter((label) => label !== "");

/** The running balance for the tenant: what they still owe, or how far ahead they've paid. */
function tenantBalance(value: number | null | undefined): string {
  if (!value) return "Settled";
  return value > 0 ? `${formatMoney(value)} due` : `${formatMoney(-value)} paid ahead`;
}

function blankZero(value: number | null | undefined) {
  return value ? value : null;
}

/**
 * A tenant's ledger, one page at a time: the journal, its running balance
 * (all-time, whatever the page or filter), paging, sort, search and the
 * date filters all come from the database (A15). Loads its first
 * page when mounted (the Ledger tab, A16). The owner's (`source="owner"`)
 * has the owner's actions; the tenant portal's (`source="tenant"`) only
 * downloads, and no owner tags (A32).
 */
export default function TenantLedgerTable(props: TenantLedgerSource) {
  const tenantId = props.source === "owner" ? props.tenantId : null;
  const forTenant = tenantId === null;
  const load = useCallback(
    (query: TenantLedgerQuery) =>
      tenantId === null ? orTenantSignIn(api.tenant.ledger(query)) : api.dashboard.tenants.ledger(tenantId, query),
    [tenantId]
  );
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    empty: EMPTY,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: tenantId === null ? "Couldn't load your payments." : "Couldn't load the ledger.",
  });
  const tenantMessaging = data.tenantMessaging;

  // "Credits only" hides Debit (always empty there) and Balance: the running
  // balance is all-time, so with the charges filtered out it jumps between rows.
  const creditsOnly = extra.show === "credits";
  const columns = useMemo<DataTableColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        minWidth: 110,
        flex: 0.6,
        valueFormatter: (value: string) => formatDateKey(value),
        filterOperators: SERVER_TEXT_OPERATORS,
      },
      {
        field: "description",
        headerName: "Description",
        flex: 1.4,
        minWidth: 200,
        filterOperators: SERVER_TEXT_OPERATORS,
        exportValue: (row) => `${row.description} (${row.caption})`,
        renderCell: ({ row }) => (
          <GridCell direction="column" spacing={0}>
            <Typography variant="body2" noWrap>
              {row.description}
            </Typography>
            <Typography variant="caption" color="textSecondary" noWrap>
              {row.caption}
            </Typography>
          </GridCell>
        ),
      },
      selectColumn<LedgerRow>("status", "Status", LEDGER_STATUS_OPTIONS, {
        minWidth: 120,
        valueGetter: (_value, row) => LEDGER_STATUS_LABELS[row.status],
        renderCell: ({ row }) =>
          row.status === "billed" ? (
            <Typography variant="caption" color="textSecondary">
              —
            </Typography>
          ) : row.status === "upcoming" ? (
            <StatusChip status="not_due_yet" />
          ) : (
            <StatusChip status={row.status} />
          ),
      }),
      // The tenant's words (A32): what they were charged and paid, and the balance as "due" or "paid ahead".
      ...(creditsOnly
        ? []
        : [
            moneyColumn<LedgerRow>("debit", tenantId === null ? "Rent charged" : "Debit", {
              valueGetter: blankZero,
              filterable: false,
              total: true,
            }),
          ]),
      moneyColumn<LedgerRow>("credit", tenantId === null ? "You paid" : "Credit", {
        valueGetter: blankZero,
        filterable: false,
        total: true,
      }),
      ...(creditsOnly
        ? []
        : [
            moneyColumn<LedgerRow>("balance", "Balance", {
              filterable: false,
              ...(tenantId === null ? { valueFormatter: tenantBalance } : {}),
            }),
          ]),
      // Searched, not filtered: the ledger query has no tag filter field. The owner's own labels.
      ...(tenantId === null ? [] : [tagsColumn<LedgerRow>("tags", "Tags", ledgerTagsOf, [], { filterable: false })]),
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        disableExport: true,
        minWidth: tenantId === null ? 200 : 320,
        headerAlign: "right",
        align: "right",
        renderCell: ({ row }) =>
          tenantId === null ? (
            <TenantReceiptActions row={row} />
          ) : (
            <ActionsCell row={row} tenantId={tenantId} tenantMessaging={tenantMessaging} />
          ),
      },
    ],
    [tenantId, tenantMessaging, creditsOnly]
  );

  const filters = useMemo(
    () => [
      {
        label: "Entries",
        value: extra.show,
        options: LEDGER_SHOW_OPTIONS,
        onChange: (show: LedgerShow) => setExtra({ show }),
        defaultValue: DEFAULT_EXTRA.show,
      },
      {
        label: "Show",
        value: extra.mode,
        options: FILTER_OPTIONS,
        onChange: (mode: FilterMode) => setExtra({ mode, from: "", to: "", month: "" }),
        defaultValue: "all" as FilterMode,
      },
    ],
    [extra.show, extra.mode, setExtra]
  );

  const dateInputs =
    extra.mode === "all" ? undefined : extra.mode === "range" ? (
      <Stack direction="row" spacing={1}>
        <DateField
          label="From"
          size="small"
          value={extra.from}
          onChange={(v) => setExtra({ from: v })}
        />
        <DateField
          label="To"
          size="small"
          value={extra.to}
          onChange={(v) => setExtra({ to: v })}
        />
      </Stack>
    ) : (
      <MonthField
        label="Month"
        size="small"
        value={extra.month}
        onChange={(v) => setExtra({ month: v })}
      />
    );

  // The picked dates as a chip; clearing them keeps "Date range" / "Month" chosen.
  const dateLabel =
    extra.mode === "range" ? formatDayRange(extra.from, extra.to) : extra.mode === "month" && extra.month ? formatMonth(monthKeyOf(extra.month)) : "";
  const dateFilter = useMemo(
    () => (dateLabel ? { label: dateLabel, onClear: () => setExtra({ from: "", to: "", month: "" }) } : undefined),
    [dateLabel, setExtra]
  );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<LedgerRow>
        title={forTenant ? "Payments" : "Ledger"}
        subtitle={forTenant ? "Rent charged, what you paid, and corrections" : "Charges, payments and corrections"}
        rows={data.rows}
        columnTotals={data.totals}
        totalsNote={
          // The totals count what the balance counts (A26): rent not due yet and old pending records are listed only.
          data.uncountedRows === 0
            ? undefined
            : forTenant
              ? `${data.uncountedRows} row${data.uncountedRows === 1 ? "" : "s"} not due yet (not in the totals)`
              : `${data.uncountedRows} row${data.uncountedRows === 1 ? "" : "s"} not counted (not due yet or pending)`
        }
        columns={columns}
        {...gridProps}
        filters={filters}
        toolbarExtra={dateInputs}
        toolbarExtraFilter={dateFilter}
        search={{ placeholder: forTenant ? "Search your payments…" : "Search the ledger…" }}
        noRowsLabel={extra.show === "credits" ? "No payments or credits match this filter." : "No entries match this filter."}
      />
    </Stack>
  );
}

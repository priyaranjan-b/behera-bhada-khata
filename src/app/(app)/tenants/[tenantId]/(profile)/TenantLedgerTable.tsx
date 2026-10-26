"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import type { GridSortModel } from "@mui/x-data-grid";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import type { LedgerRow } from "@/lib/domain/tenantLedger";
import type { TenantLedgerQuery, TenantLedgerView } from "@/lib/contracts";
import { formatDateKey, monthDayRange } from "@/lib/dates";
import { statusLabel } from "@/lib/domain/status";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import DataTable, { moneyColumn, SERVER_TEXT_OPERATORS, useServerGrid, type DataTableColDef } from "@/components/ui/DataTable";
import { GridCell } from "@/components/ui";
import { StatusChip } from "@/components/domain/StatusChip";
import ResendButton from "@/components/domain/ResendButton";
import ProofsButton from "@/components/domain/ProofsButton";
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
  mode: FilterMode;
  from: string;
  to: string;
  /** yyyy-MM, from `<input type="month">`. */
  month: string;
}

const DEFAULT_EXTRA: Extra = { mode: "all", from: "", to: "", month: "" };
const DEFAULT_SORT: GridSortModel = [{ field: "date", sort: "desc" }];
const EMPTY: TenantLedgerView = { rows: [], total: 0, all: 0, page: 0, tenantMessaging: false };

function toQuery(grid: GridQueryParams, extra: Extra): TenantLedgerQuery {
  if (extra.mode === "month" && extra.month) return { ...grid, ...monthDayRange(extra.month) };
  if (extra.mode === "range") return { ...grid, from: extra.from || undefined, to: extra.to || undefined };
  return grid;
}

// Every payment/adjustment counts once recorded (0010): its receipt can be
// downloaded straight away (e.g. to send on WhatsApp), and the tenant can be
// sent a link to acknowledge it until they have.
function ActionsCell({ row, tenantId, tenantMessaging }: { row: LedgerRow; tenantId: string; tenantMessaging: boolean }) {
  if (row.type === "charge" || !row.refId) return null;
  return (
    <GridCell align="end">
      {row.type === "payment" ? <ProofsButton paymentId={row.refId} proofs={row.proofs ?? []} /> : null}
      <Button
        size="small"
        startIcon={<DownloadRoundedIcon />}
        href={apiHref(
          row.type === "payment"
            ? apiPaths.dashboard.payments.receipt(row.refId)
            : apiPaths.dashboard.adjustments.receipt(row.refId)
        )}
        download
      >
        Receipt
      </Button>
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

function blankZero(value: number | null | undefined) {
  return value ? value : null;
}

/**
 * A tenant's ledger, one page at a time: the journal, its running balance
 * (all-time, whatever the page or filter), paging, sort, search and the
 * date filters all come from SQL (tenant_ledger_page, A15). Loads its first
 * page when mounted (the Ledger tab, A16).
 */
export default function TenantLedgerTable({ tenantId }: { tenantId: string }) {
  const load = useCallback((query: TenantLedgerQuery) => api.dashboard.tenants.ledger(tenantId, query), [tenantId]);
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    empty: EMPTY,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the ledger.",
  });
  const tenantMessaging = data.tenantMessaging;

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
      {
        field: "status",
        headerName: "Status",
        minWidth: 120,
        filterOperators: SERVER_TEXT_OPERATORS,
        valueFormatter: (value: LedgerRow["status"]) =>
          value === "billed" ? "" : statusLabel(value === "upcoming" ? "not_due_yet" : value),
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
      },
      moneyColumn<LedgerRow>("debit", "Debit", { valueGetter: blankZero, filterable: false }),
      moneyColumn<LedgerRow>("credit", "Credit", { valueGetter: blankZero, filterable: false }),
      moneyColumn<LedgerRow>("balance", "Balance", { filterable: false }),
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        disableExport: true,
        minWidth: 320,
        headerAlign: "right",
        align: "right",
        renderCell: ({ row }) => <ActionsCell row={row} tenantId={tenantId} tenantMessaging={tenantMessaging} />,
      },
    ],
    [tenantId, tenantMessaging]
  );

  const filters = useMemo(
    () => [
      {
        label: "Show",
        value: extra.mode,
        options: FILTER_OPTIONS,
        onChange: (mode: FilterMode) => setExtra({ mode, from: "", to: "", month: "" }),
        defaultValue: "all" as FilterMode,
      },
    ],
    [extra.mode, setExtra]
  );

  const dateInputs =
    extra.mode === "all" ? undefined : extra.mode === "range" ? (
      <Stack direction="row" spacing={1}>
        <TextField
          label="From"
          type="date"
          size="small"
          value={extra.from}
          onChange={(e) => setExtra({ from: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={extra.to}
          onChange={(e) => setExtra({ to: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
    ) : (
      <TextField
        label="Month"
        type="month"
        size="small"
        value={extra.month}
        onChange={(e) => setExtra({ month: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<LedgerRow>
        title="Ledger"
        subtitle="Charges, payments and corrections"
        rows={data.rows}
        columns={columns}
        {...gridProps}
        filters={filters}
        toolbarExtra={dateInputs}
        search={{ placeholder: "Search the ledger…" }}
        noRowsLabel="No entries match this filter."
      />
    </Stack>
  );
}

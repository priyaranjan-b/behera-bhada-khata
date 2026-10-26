"use client";

import { useCallback, useMemo } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, { useServerGrid } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/DataDisplay";
import { api } from "@/lib/api-client";
import type { AuditEntry, AuditTablePage, AuditTableQuery } from "@/lib/contracts";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/domain/audit";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import { ACTIVITY_COLUMNS, TENANT_HISTORY_COLUMNS } from "./auditColumns";

/** Whose history: every change (Activity) or one tenant's (the tenant page). Plain data, so a Server Component can pass it. */
export type AuditHistorySource = { kind: "all" } | { kind: "tenant"; tenantId: string };

type Show = AuditCategory | "all";

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "all", label: "All changes" },
  ...AUDIT_CATEGORIES.map((value) => ({ value, label: AUDIT_CATEGORY_LABELS[value] })),
];

interface Extra {
  show: Show;
  from: string;
  to: string;
}

const DEFAULT_EXTRA: Extra = { show: "all", from: "", to: "" };
const DEFAULT_SORT: GridSortModel = [{ field: "at", sort: "desc" }];
const EMPTY: AuditTablePage = { entries: [], total: 0, all: 0, page: 0 };

function toQuery(grid: GridQueryParams, extra: Extra): AuditTableQuery {
  return {
    ...grid,
    category: extra.show === "all" ? undefined : extra.show,
    from: extra.from || undefined,
    to: extra.to || undefined,
  };
}

const getRowId = (row: AuditEntry) => row.id;

/**
 * A history table, one page at a time: paging, sorting, search, column
 * filters, "Show" and dates are one database query (audit_history_page, A14)
 * over the text stored with each change, so they cover the whole history.
 * Download Excel saves the page on screen. Without `initial` it loads its
 * first page when mounted (the tenant's Change history tab, A16).
 */
export default function AuditHistoryTable({
  source,
  initial,
  title,
  subtitle,
  emptyDescription,
}: {
  source: AuditHistorySource;
  initial?: AuditTablePage;
  title: string;
  subtitle: string;
  emptyDescription: string;
}) {
  const tenantId = source.kind === "tenant" ? source.tenantId : null;
  const load = useCallback(
    (query: AuditTableQuery) => (tenantId ? api.dashboard.tenants.history(tenantId, query) : api.dashboard.activity(query)),
    [tenantId]
  );
  const { data, error, extra, setExtra, gridProps } = useServerGrid({
    ...(initial ? { initial } : { empty: EMPTY }),
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the history.",
  });

  const filters = useMemo(
    () => [
      {
        label: "Show",
        value: extra.show,
        options: SHOW_OPTIONS,
        onChange: (show: Show) => setExtra({ show }),
        defaultValue: "all" as Show,
      },
    ],
    [extra.show, setExtra]
  );

  const dateInputs = (
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
  );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<AuditEntry>
        title={title}
        subtitle={subtitle}
        rows={data.entries}
        columns={tenantId ? TENANT_HISTORY_COLUMNS : ACTIVITY_COLUMNS}
        getRowId={getRowId}
        {...gridProps}
        filters={filters}
        toolbarExtra={dateInputs}
        toolbarExtraActive={Boolean(extra.from || extra.to)}
        search={{ placeholder: "Search changes…" }}
        noRowsLabel="No changes match these filters."
        emptyState={<EmptyState icon={<HistoryRoundedIcon />} title="No changes recorded yet" description={emptyDescription} />}
      />
    </Stack>
  );
}

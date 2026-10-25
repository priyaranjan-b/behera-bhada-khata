"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Link from "@/components/ui/Link";
import DataTable, { type DataTableColDef } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/DataDisplay";
import { GridCell } from "@/components/ui";
import { LoadingButton } from "@/components/ui/Loading";
import { api, errorMessage } from "@/lib/api-client";
import type { ActivityQuery, AuditEntry, AuditPage } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS, describeAuditEntry, type AuditCategory } from "@/lib/domain/audit";
import { routes } from "@/lib/routes";

type Show = AuditCategory | "all";

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "all", label: "All changes" },
  ...AUDIT_CATEGORIES.map((value) => ({ value, label: AUDIT_CATEGORY_LABELS[value] })),
];

interface ActivityRow extends AuditEntry {
  title: string;
  details: string;
}

function toRows(entries: AuditEntry[]): ActivityRow[] {
  return entries.map((entry) => {
    const { title, lines } = describeAuditEntry(entry);
    return { ...entry, title, details: lines.join(" · ") };
  });
}

const columns: DataTableColDef<ActivityRow>[] = [
  {
    field: "at",
    headerName: "When",
    minWidth: 170,
    valueFormatter: (value: string) => formatDateTime(value),
  },
  { field: "actorName", headerName: "Who", minWidth: 140 },
  { field: "title", headerName: "What", flex: 1, minWidth: 200 },
  {
    field: "tenantName",
    headerName: "Tenant / house",
    flex: 1,
    minWidth: 180,
    valueGetter: (_v, row) => [row.tenantName, row.unitCode].filter(Boolean).join(" "),
    exportValue: (row) => [row.tenantName, row.unitCode].filter(Boolean).join(" · "),
    renderCell: ({ row }) => (
      <GridCell direction="column" spacing={0}>
        {row.tenantId && row.tenantName ? (
          <MuiLink component={Link} href={routes.tenants.detail(row.tenantId)} variant="body2" noWrap>
            {row.tenantName}
          </MuiLink>
        ) : null}
        {row.unitCode ? (
          <Typography variant="caption" color="textSecondary" noWrap>
            {row.unitCode}
          </Typography>
        ) : null}
      </GridCell>
    ),
  },
  {
    field: "details",
    headerName: "Details",
    flex: 2,
    minWidth: 260,
    sortable: false,
    renderCell: ({ row }) => (
      <GridCell>
        <Typography variant="body2" noWrap title={row.details}>
          {row.details}
        </Typography>
      </GridCell>
    ),
  },
];

/** Every audited change, newest first; "Show" and the dates filter on the server. */
export default function ActivityList({ initial }: { initial: AuditPage }) {
  const [show, setShow] = useState<Show>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState<AuditPage>(initial);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => toRows(page.entries), [page.entries]);

  const query = (next: { show?: Show; from?: string; to?: string }): ActivityQuery => {
    const s = next.show ?? show;
    const f = next.from ?? from;
    const t = next.to ?? to;
    return { category: s === "all" ? undefined : s, from: f || undefined, to: t || undefined };
  };

  async function reload(next: { show?: Show; from?: string; to?: string }) {
    if (next.show !== undefined) setShow(next.show);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    try {
      setPage(await api.dashboard.activity(query(next)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the activity."));
    }
  }

  async function showOlder() {
    if (page.nextBefore === null) return;
    try {
      const older = await api.dashboard.activity({ ...query({}), before: page.nextBefore });
      setPage({ entries: [...page.entries, ...older.entries], nextBefore: older.nextBefore });
    } catch (err) {
      setError(errorMessage(err, "Couldn't load older changes."));
    }
  }

  const filters = useMemo(
    () => [{ label: "Show", value: show, options: SHOW_OPTIONS, onChange: (v: Show) => reload({ show: v }), defaultValue: "all" as Show }],
    // reload reads from/to, so the filter is rebuilt when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, from, to]
  );

  const dateInputs = (
    <Stack direction="row" spacing={1}>
      <TextField
        label="From"
        type="date"
        size="small"
        value={from}
        onChange={(e) => reload({ from: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="To"
        type="date"
        size="small"
        value={to}
        onChange={(e) => reload({ to: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  );

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<ActivityRow>
        title="Activity"
        subtitle={page.nextBefore === null ? "Newest first" : "Newest first · older changes below"}
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        toolbarExtra={dateInputs}
        search={{ placeholder: "Search changes…" }}
        pageSize={25}
        noRowsLabel="No changes match these filters."
        emptyState={
          <EmptyState
            icon={<HistoryRoundedIcon />}
            title="No changes recorded yet"
            description="Every change to tenants, rent, houses and payments shows up here from now on."
          />
        }
      />
      {page.nextBefore !== null ? (
        <Box>
          <LoadingButton variant="outlined" onClick={showOlder}>
            Load older changes
          </LoadingButton>
        </Box>
      ) : null}
    </Stack>
  );
}

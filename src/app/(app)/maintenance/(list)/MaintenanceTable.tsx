"use client";

import { use, useCallback, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  moneyColumn,
  selectColumn,
  SERVER_TEXT_OPERATORS,
  tagsColumn,
  useServerGrid,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, StatusBadge } from "@/components/ui/DataDisplay";
import { GridCell, TagsCell } from "@/components/ui/GridCells";
import Link from "@/components/ui/Link";
import { LoadingButton } from "@/components/ui/Loading";
import EditTagsDialog from "@/components/domain/EditTagsDialog";
import { api } from "@/lib/api-client";
import type { MaintenanceListRow, MaintenancePage, MaintenancePageQuery } from "@/lib/contracts";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import {
  MAINTENANCE_CATEGORY_OPTIONS,
  MAINTENANCE_STATUS_LABELS,
  maintenanceCategoryLabel,
} from "@/lib/domain/maintenance";
import type { DayRange } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { useDates } from "@/components/ui/useDates";

const tagsOf = (row: MaintenanceListRow) => row.tags;
/** The database filters on the labels the columns show. */
const CATEGORY_LABELS = MAINTENANCE_CATEGORY_OPTIONS.map((o) => o.label);
const STATUS_LABELS = Object.values(MAINTENANCE_STATUS_LABELS);
const statusOf = (row: MaintenanceListRow) => MAINTENANCE_STATUS_LABELS[row.voided ? "voided" : "counted"];
const housesOf = (row: MaintenanceListRow) => row.unitCodes.join(", ");

const baseColumns: DataTableColDef<MaintenanceListRow>[] = [
  {
    field: "expenseDate",
    headerName: "Date",
    minWidth: 120,
    dateKind: "date",
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  {
    field: "description",
    headerName: "What for",
    flex: 1.4,
    minWidth: 200,
    filterOperators: SERVER_TEXT_OPERATORS,
    renderCell: ({ row }) => (
      <GridCell>
        <MuiLink component={Link} href={routes.maintenance.detail(row.id)} aria-label={`Open expense: ${row.description}`}>
          {row.description}
        </MuiLink>
        {row.voided ? <StatusBadge tone="neutral" label={MAINTENANCE_STATUS_LABELS.voided} /> : null}
      </GridCell>
    ),
  },
  selectColumn<MaintenanceListRow>("category", "Category", CATEGORY_LABELS, {
    minWidth: 150,
    valueGetter: (_value, row) => maintenanceCategoryLabel(row.category),
  }),
  {
    field: "unitsText",
    headerName: "Houses",
    flex: 1,
    minWidth: 160,
    valueGetter: (_value, row) => housesOf(row),
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  moneyColumn<MaintenanceListRow>("amount", "Amount", { filterable: false, total: true }),
  {
    field: "vendor",
    headerName: "Paid to",
    flex: 0.8,
    minWidth: 140,
    sortable: false,
    valueGetter: (_value, row) => row.vendor ?? "",
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  {
    field: "note",
    headerName: "Note",
    flex: 0.8,
    minWidth: 140,
    sortable: false,
    valueGetter: (_value, row) => row.note ?? "",
    filterOperators: SERVER_TEXT_OPERATORS,
  },
  selectColumn<MaintenanceListRow>("status", "Status", STATUS_LABELS, {
    minWidth: 110,
    sortable: false,
    valueGetter: (_value, row) => statusOf(row),
  }),
  {
    field: "fileCount",
    headerName: "Files",
    type: "number",
    minWidth: 80,
    sortable: false,
    filterable: false,
  },
];

/** The Paid by column (filtered by the suggestions) with an edit button per row. */
function columnsWithTags(
  tagOptions: readonly string[],
  onEdit: (row: MaintenanceListRow) => void
): DataTableColDef<MaintenanceListRow>[] {
  const [date, description, category, houses, amount, ...rest] = baseColumns;
  return [
    date,
    description,
    category,
    houses,
    amount,
    tagsColumn<MaintenanceListRow>("tags", "Paid by", tagsOf, tagOptions, {
      minWidth: 180,
      renderCell: ({ row }) => (
        <TagsCell
          tags={row.tags}
          action={
            <IconButton size="small" aria-label={`Edit who paid for ${row.description}`} onClick={() => onEdit(row)}>
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          }
        />
      ),
    }),
    ...rest,
  ];
}

const DEFAULT_EXTRA = {};
/**
 * Until the first page arrives from the browser's call (the grid shows skeleton
 * rows meanwhile). Its `from`/`to` are placeholders, never read.
 */
const EMPTY_PAGE: MaintenancePage = { from: "", to: "", rows: [], total: 0, all: 0, page: 0, totals: { amount: 0 }, voided: 0 };
const DEFAULT_SORT: GridSortModel = [{ field: "expenseDate", sort: "desc" }];
const getRowId = (row: MaintenanceListRow) => row.id;
const toQuery = (grid: GridQueryParams): MaintenancePageQuery => grid;

/**
 * The Maintenance table's state: the browser loads each page over the API and
 * paging, sort, search and filters run in the database (A15). Held by
 * MaintenanceView, so the stat cards can set its filters (A28).
 */
export function useMaintenanceGrid({ from, to }: DayRange) {
  const load = useCallback((q: MaintenancePageQuery) => api.dashboard.maintenance.list({ from, to, ...q }), [from, to]);
  return useServerGrid({
    empty: EMPTY_PAGE,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the maintenance expenses.",
  });
}

type MaintenanceGrid = ReturnType<typeof useMaintenanceGrid>;

/**
 * Every expense in the days, one page at a time, with the who-paid editor.
 * Suspends on the tag suggestions only (its own AsyncSection), so the stat
 * cards above never wait for them.
 */
export default function MaintenanceTable({
  grid,
  rangeLabel,
  tagSuggestions,
  onPayersChanged,
}: {
  grid: MaintenanceGrid;
  /** After a "Paid by" edit: the payer cards above count by payer, so they need the totals again. */
  onPayersChanged: () => void;
  rangeLabel: string;
  /** Who-paid names for the Paid by column and the tag editor. */
  tagSuggestions: Promise<string[]>;
}) {
  const { formatDate } = useDates();
  const { data, error, reload, gridProps } = grid;
  const [editing, setEditing] = useState<MaintenanceListRow | null>(null);
  const [suggestions, setSuggestions] = useState(use(tagSuggestions));
  const columns = useMemo(() => columnsWithTags(suggestions, setEditing), [suggestions]);
  // No page has arrived yet: say the load failed, with a retry, instead of "nothing spent" next to the cards' money.
  const failedFirstLoad = error !== null && data === EMPTY_PAGE;

  return (
    <>
      {error && !failedFirstLoad ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<MaintenanceListRow>
        title="Maintenance expenses"
        subtitle={rangeLabel}
        rows={data.rows}
        // What was spent: a voided expense is listed but counted nowhere (D35).
        columnTotals={data.totals}
        totalsNote={data.voided > 0 ? `${data.voided} voided, not counted` : undefined}
        {...gridProps}
        columns={columns}
        getRowId={getRowId}
        search={{ placeholder: "Search what for, house, category, payer…" }}
        rowDensity="standard"
        noRowsLabel="No expenses match."
        emptyState={
          failedFirstLoad ? (
            <EmptyState
              icon={<ErrorOutlineRoundedIcon />}
              title="Couldn't load the expenses"
              description={error}
              action={
                <LoadingButton variant="outlined" size="small" onClick={() => reload()}>
                  Try again
                </LoadingButton>
              }
            />
          ) : (
            <EmptyState
              icon={<HandymanRoundedIcon />}
              title="Nothing spent in these days"
              description="Record a repair, a bill or a tax payment and it shows here by the day it was paid."
            />
          )
        }
      />
      {editing ? (
        <EditTagsDialog
          key={editing.id}
          title="Paid by"
          summary={`${editing.description} · ${formatMoney(editing.amount)} on ${formatDate(editing.expenseDate)}`}
          tags={editing.tags}
          suggestions={suggestions}
          label="Paid by"
          helperText="Who paid it - pick one or type a new name"
          save={async (tags) => (await api.dashboard.maintenance.setTags(editing.id, { tags })).tags}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSuggestions((known) => {
              const added = saved.filter((t) => !known.some((k) => k.toLowerCase() === t.toLowerCase()));
              return added.length > 0 ? [...known, ...added].sort((a, b) => a.localeCompare(b)) : known;
            });
            void reload();
            onPayersChanged();
          }}
        />
      ) : null}
    </>
  );
}

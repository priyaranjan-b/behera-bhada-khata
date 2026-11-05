"use client";

import { useCallback, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import type { GridSortModel } from "@mui/x-data-grid";
import DataTable, {
  isCardFilterOn,
  moneyColumn,
  selectColumn,
  SERVER_TEXT_OPERATORS,
  tagsColumn,
  toggleCardFilter,
  useServerGrid,
  type CardFilter,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, StatusBadge } from "@/components/ui/DataDisplay";
import { GridCell, TagsCell } from "@/components/ui/GridCells";
import Link from "@/components/ui/Link";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import LabelOffRoundedIcon from "@mui/icons-material/LabelOffRounded";
import StatCard from "@/components/ui/StatCard";
import EditTagsDialog from "@/components/domain/EditTagsDialog";
import { api } from "@/lib/api-client";
import type { MaintenanceListRow, MaintenancePage, MaintenancePageQuery } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import type { GridQueryParams } from "@/lib/domain/gridQuery";
import {
  MAINTENANCE_CATEGORY_OPTIONS,
  MAINTENANCE_STATUS_LABELS,
  maintenanceCategoryLabel,
} from "@/lib/domain/maintenance";
import type { DayRange } from "@/lib/domain/payments";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { MAINTENANCE_STAT_COLUMNS } from "./maintenanceStatColumns";
import StatCardRow from "@/components/ui/StatCardRow";

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
    valueFormatter: (value: string) => formatDateKey(value),
    exportValue: (row) => formatDateKey(row.expenseDate),
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
const DEFAULT_SORT: GridSortModel = [{ field: "expenseDate", sort: "desc" }];
const getRowId = (row: MaintenanceListRow) => row.id;
const toQuery = (grid: GridQueryParams): MaintenancePageQuery => grid;

/** "32% of spent", or nothing when nothing was spent. */
const shareOf = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}% of spent` : "Nothing spent");

/**
 * Every expense in the days, one page at a time: paging, sort, search and
 * filters run in the database (A15), and the cards add up every expense
 * the search and filters find (voided ones never count).
 */
export default function MaintenanceView({
  initial,
  range,
  rangeLabel,
  tagSuggestions,
}: {
  initial: MaintenancePage;
  range: DayRange;
  rangeLabel: string;
  tagSuggestions: string[];
}) {
  const { from, to } = range;
  const [editing, setEditing] = useState<MaintenanceListRow | null>(null);
  const [suggestions, setSuggestions] = useState(tagSuggestions);
  const columns = useMemo(() => columnsWithTags(suggestions, setEditing), [suggestions]);
  const load = useCallback((q: MaintenancePageQuery) => api.dashboard.maintenance.list({ from, to, ...q }), [from, to]);
  const { data, error, reload, gridProps, filter, setFilter } = useServerGrid({
    initial,
    load,
    toQuery,
    defaultSort: DEFAULT_SORT,
    defaultExtra: DEFAULT_EXTRA,
    errorText: "Couldn't load the maintenance expenses.",
  });
  const { totals } = data;
  const narrowed = data.total < data.all;
  // A category or payer card whose filter is on keeps naming that one (a tie can't re-sort it into another);
  // otherwise it shows the biggest. The rest follow it.
  const pinned = (field: string) => {
    const item = filter.items.find((i) => i.field === field && i.operator === "is" && typeof i.value === "string");
    return item ? (item.value as string) : null;
  };
  const pinnedFirst = <T,>(list: T[], name: (t: T) => string, value: string | null) =>
    value === null ? list : [...list.filter((t) => name(t) === value), ...list.filter((t) => name(t) !== value)];
  const categories = pinnedFirst(
    Object.entries(totals.byCategory)
      .map(([category, amount]) => ({ label: maintenanceCategoryLabel(category), amount: amount ?? 0 }))
      .sort((a, b) => b.amount - a.amount),
    (c) => c.label,
    pinned("category")
  );
  const [topPayer, ...otherPayers] = pinnedFirst(totals.byPaidBy, (p) => p.name, pinned("tags"));
  // The footer adds up what was spent: a voided expense is listed but counted nowhere (D35).
  const columnTotals = useMemo(() => ({ amount: totals.amount }), [totals.amount]);
  const voided = data.total - totals.count;
  // The category and payer cards filter the table to the expenses they count; tapped again, they clear it (A28).
  // "Spent" totals the table on screen, and "Payer not tagged" has no column filter for "no tags".
  const cardFilter = (f: CardFilter | null) =>
    f ? { onClick: () => void setFilter(toggleCardFilter(filter, f)), selected: isCardFilterOn(filter, f) } : {};
  const categoryFilter: CardFilter | null = categories[0] ? { field: "category", operator: "is", value: categories[0].label } : null;
  const payerFilter: CardFilter | null = topPayer ? { field: "tags", operator: "is", value: topPayer.name } : null;

  return (
    <Stack spacing={2}>
      <StatCardRow columns={MAINTENANCE_STAT_COLUMNS} label="Maintenance totals">
        <StatCard
          title="Spent"
          icon={<HandymanRoundedIcon />}
          tone="primary"
          variant="gradient"
          value={formatMoney(totals.amount)}
          caption={`${totals.count} expense${totals.count === 1 ? "" : "s"}${narrowed ? " matching the filters" : ""}${
            totals.cash < totals.amount ? ` · ${formatMoney(totals.amount - totals.cash)} by set-off` : ""
          }`}
        />
        <StatCard
          title={categories[0] ? `Most on ${categories[0].label}` : "Biggest category"}
          icon={<CategoryRoundedIcon />}
          value={formatMoney(categories[0]?.amount ?? 0)}
          {...cardFilter(categoryFilter)}
          caption={
            categories[1]
              ? `Then ${categories[1].label}: ${formatMoney(categories[1].amount)}`
              : shareOf(categories[0]?.amount ?? 0, totals.amount)
          }
        />
        <StatCard
          title={topPayer ? `Paid by ${topPayer.name}` : "Paid by"}
          icon={<PersonRoundedIcon />}
          value={formatMoney(topPayer?.amount ?? 0)}
          {...cardFilter(payerFilter)}
          caption={
            otherPayers.length > 0
              ? otherPayers
                  .slice(0, 2)
                  .map((p) => `${p.name} ${formatMoney(p.amount)}`)
                  .join(" · ")
              : topPayer
                ? shareOf(topPayer.amount, totals.amount)
                : "No one tagged yet"
          }
        />
        <StatCard
          title="Payer not tagged"
          icon={<LabelOffRoundedIcon />}
          tone={totals.untagged > 0 ? "warning" : "neutral"}
          value={formatMoney(totals.untagged)}
          caption={shareOf(totals.untagged, totals.amount)}
        />
      </StatCardRow>

      {error ? <Alert severity="error">{error}</Alert> : null}
      <DataTable<MaintenanceListRow>
        title="Maintenance expenses"
        subtitle={rangeLabel}
        rows={data.rows}
        columnTotals={columnTotals}
        totalsNote={voided > 0 ? `${voided} voided, not counted` : undefined}
        {...gridProps}
        columns={columns}
        getRowId={getRowId}
        search={{ placeholder: "Search what for, house, category, payer…" }}
        rowDensity="standard"
        noRowsLabel="No expenses match."
        emptyState={
          <EmptyState
            icon={<HandymanRoundedIcon />}
            title="Nothing spent in these days"
            description="Record a repair, a bill or a tax payment and it shows here by the day it was paid."
          />
        }
      />
      {editing ? (
        <EditTagsDialog
          key={editing.id}
          title="Paid by"
          summary={`${editing.description} · ${formatMoney(editing.amount)} on ${formatDateKey(editing.expenseDate)}`}
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
          }}
        />
      ) : null}
    </Stack>
  );
}

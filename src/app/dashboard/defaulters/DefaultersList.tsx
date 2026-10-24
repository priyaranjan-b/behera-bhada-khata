"use client";

import { useMemo, useState } from "react";
import type { GridColDef } from "@mui/x-data-grid";
import Typography from "@mui/material/Typography";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import DataTable, { moneyColumn } from "@/components/ui/DataTable";
import { EmptyState, IdentityCell, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { GridCell } from "@/components/ui";
import type { DefaulterRow } from "@/lib/contracts";
import { formatDateKey, formatMonth } from "@/lib/dates";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/domain/reports";
import { formatUnits } from "@/lib/domain/tenant";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";

type BandFilter = "all" | "2" | "4" | "7";

const BAND_OPTIONS: { value: BandFilter; label: string }[] = [
  { value: "all", label: "All defaulters" },
  { value: "2", label: "2+ months behind" },
  { value: "4", label: "4+ months behind" },
  { value: "7", label: "Over 6 months behind" },
];

const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/** Unpaid rent of one age band; a dash when nothing is owed there. */
function ageColumn(key: AgingBucketKey, headerName: string): GridColDef<DefaulterRow> {
  const band = AGING_BUCKETS.find((b) => b.key === key)?.label;
  return moneyColumn<DefaulterRow>(`age_${key}`, headerName, {
    minWidth: 115,
    valueGetter: (_value, row) => row.byAge[key],
    valueFormatter: (value: number) => (value > 0 ? formatMoney(value) : "—"),
    description: `Unpaid rent for months that ended ${band} ago`,
  });
}

const columns: GridColDef<DefaulterRow>[] = [
  {
    field: "displayName",
    headerName: "Tenant",
    flex: 1.4,
    minWidth: 200,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.displayName}
        caption={row.movedOut ? "Moved out" : (row.contactName ?? undefined)}
        href={routes.tenants.detail(row.tenantId)}
      />
    ),
  },
  {
    field: "overdueMonths",
    headerName: "Behind",
    type: "number",
    minWidth: 120,
    headerAlign: "left",
    align: "left",
    description: "Months that have ended with rent still unpaid",
    renderCell: ({ row }) => (
      <StatusBadge tone={row.overdueMonths >= 2 ? "danger" : "warning"} label={months(row.overdueMonths)} />
    ),
  },
  {
    field: "oldestUnpaidMonth",
    headerName: "Unpaid since",
    minWidth: 130,
    valueFormatter: (value: string | null) => (value ? formatMonth(value, "short") : ""),
  },
  moneyColumn<DefaulterRow>("totalOutstanding", "Outstanding", { minWidth: 140 }),
  ageColumn("m1", "1 mo"),
  ageColumn("m2to3", "2–3 mo"),
  ageColumn("m4to6", "4–6 mo"),
  ageColumn("m7plus", "6+ mo"),
  moneyColumn<DefaulterRow>("monthlyRent", "Rent / month", { minWidth: 140 }),
  {
    field: "lastPaymentDate",
    headerName: "Last payment",
    minWidth: 140,
    valueFormatter: (value: string | null) => (value ? formatDateKey(value) : "None recorded"),
  },
  {
    field: "propertyName",
    headerName: "Houses",
    flex: 1,
    minWidth: 180,
    sortable: false,
    renderCell: ({ row }) => (
      <GridCell>
        <TagPill label={row.propertyName} />
        <Typography variant="caption" color="textSecondary" noWrap title={formatUnits(row.unitCodes)}>
          {formatUnits(row.unitCodes)}
        </Typography>
      </GridCell>
    ),
  },
];

export default function DefaultersList({ rows }: { rows: DefaulterRow[] }) {
  const [band, setBand] = useState<BandFilter>("all");
  const filtered = useMemo(
    () => (band === "all" ? rows : rows.filter((r) => r.overdueMonths >= Number(band))),
    [rows, band]
  );
  const owed = filtered.reduce((sum, r) => sum + r.totalOutstanding, 0);

  return (
    <DataTable<DefaulterRow>
      title="Defaulters"
      subtitle={`${formatMoney(owed)} owed`}
      rows={filtered}
      totalCount={rows.length}
      columns={columns}
      getRowId={(row) => row.tenantId}
      filters={[{ label: "Show", value: band, options: BAND_OPTIONS, onChange: setBand, defaultValue: "all" }]}
      search={{ placeholder: "Search tenant…" }}
      noRowsLabel="No tenants match this filter."
      // Rows arrive sorted by compareAging (most months behind, then most owed); the grid's sort is stable.
      initialState={{ sorting: { sortModel: [{ field: "overdueMonths", sort: "desc" }] } }}
      emptyState={
        <EmptyState
          icon={<TaskAltRoundedIcon />}
          title="No one is behind"
          description="Every tenant has paid rent up to the end of last month."
        />
      }
    />
  );
}

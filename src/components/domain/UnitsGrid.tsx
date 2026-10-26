"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@/components/ui/Link";
import DataTable, { type DataTableColDef } from "@/components/ui/DataTable";
import { EmptyState, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { DetailList, DetailRow, GridCell } from "@/components/ui";
import AuditTimeline from "./AuditTimeline";
import { UNIT_TYPE_LABELS, formatFloor } from "@/lib/domain/tenant";
import type { UnitRow } from "@/lib/contracts";
import { HOUSE_FILTERS, matchesHouseFilter, type HouseFilter } from "@/lib/domain/houses";
import { formatDateKey } from "@/lib/dates";
import { routes } from "@/lib/routes";

function HistoryDialog({ unit, onClose }: { unit: UnitRow | null; onClose: () => void }) {
  return (
    <Dialog open={unit !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{unit ? `History of ${unit.unitCode}` : ""}</DialogTitle>
      <DialogContent>
        {unit ? (
          <Stack spacing={3}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" component="h3">
                Occupants
              </Typography>
              {unit.history.length > 0 ? (
                <DetailList dividers>
                  {[...unit.history].reverse().map((h) => (
                    <DetailRow
                      key={`${h.tenantId}-${h.startDate}`}
                      label={`${formatDateKey(h.startDate)} → ${h.endDate ? formatDateKey(h.endDate) : "now"}`}
                    >
                      <MuiLink component={Link} href={routes.tenants.detail(h.tenantId)}>
                        {h.tenantName}
                      </MuiLink>
                    </DetailRow>
                  ))}
                </DetailList>
              ) : (
                <EmptyState title="No tenants yet" description="Nobody has been placed in this house." />
              )}
            </Stack>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" component="h3">
                Changes
              </Typography>
              <AuditTimeline unitCode={unit.unitCode} showTenant />
            </Stack>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Houses with who is in each. On a tower page it lists that tower's houses;
 * with `showTower` it lists every house (the Houses page) and adds the tower
 * column and a "Show" filter, starting from `initialFilter`.
 */
export default function UnitsGrid({
  units,
  propertyName,
  subtitle,
  emptyState,
  showTower = false,
  initialFilter = "all",
}: {
  units: UnitRow[];
  propertyName: string;
  subtitle?: string;
  emptyState?: React.ReactNode;
  showTower?: boolean;
  initialFilter?: HouseFilter;
}) {
  const [historyOf, setHistoryOf] = useState<UnitRow | null>(null);
  const [filter, setFilter] = useState<HouseFilter>(initialFilter);
  const rows = useMemo(() => (showTower ? units.filter((u) => matchesHouseFilter({ isActive: u.isActive, occupied: Boolean(u.currentTenant) }, filter)) : units), [units, filter, showTower]);

  const towerColumn: DataTableColDef<UnitRow> = {
    field: "propertyCode",
    headerName: "Tower",
    flex: 1,
    minWidth: 170,
    valueGetter: (_v, row) => `${row.propertyCode} ${row.propertyName} ${row.locationName}`,
    exportValue: (row) => `${row.propertyCode} · ${row.propertyName} · ${row.locationName}`,
    renderCell: ({ row }) => (
      <GridCell direction="column" spacing={0}>
        <MuiLink component={Link} href={routes.properties.detail(row.propertyCode)} variant="body2" noWrap>
          {row.propertyCode} · {row.propertyName}
        </MuiLink>
        <Typography variant="caption" color="textSecondary" noWrap>
          {row.locationName}
        </Typography>
      </GridCell>
    ),
  };

  const columns: DataTableColDef<UnitRow>[] = [
    ...(showTower ? [towerColumn] : []),
    {
      field: "unitCode",
      headerName: "House",
      flex: 1,
      minWidth: 170,
      valueGetter: (_v, row) => `${row.unitCode} ${row.label ?? ""}`,
      exportValue: (row) => (row.label ? `${row.unitCode} · ${row.label}` : row.unitCode),
      renderCell: ({ row }) => (
        <GridCell direction="column" spacing={0}>
          <Typography variant="body2" noWrap>
            {row.unitCode}
            {row.label ? ` · ${row.label}` : ""}
          </Typography>
        </GridCell>
      ),
    },
    {
      field: "floor",
      headerName: "Floor",
      minWidth: 110,
      valueFormatter: (value: string | null) => formatFloor(value) || "—",
    },
    {
      field: "unitType",
      headerName: "Type",
      minWidth: 120,
      valueFormatter: (_value, row) => UNIT_TYPE_LABELS[row.unitType],
      renderCell: ({ row }) => (
        <GridCell>
          <TagPill label={UNIT_TYPE_LABELS[row.unitType]} />
        </GridCell>
      ),
    },
    {
      field: "currentTenant",
      headerName: "Occupant",
      flex: 1,
      minWidth: 180,
      valueGetter: (_v, row) => row.currentTenant?.displayName ?? (row.isActive ? "Vacant" : "Retired"),
      renderCell: ({ row }) => (
        <GridCell>
          {row.currentTenant ? (
            <MuiLink component={Link} href={routes.tenants.detail(row.currentTenant.id)} noWrap>
              {row.currentTenant.displayName}
            </MuiLink>
          ) : row.isActive ? (
            <StatusBadge tone="info" label="Vacant" />
          ) : (
            <StatusBadge tone="neutral" label="Retired" />
          )}
        </GridCell>
      ),
    },
    {
      field: "since",
      headerName: "Since",
      minWidth: 110,
      valueGetter: (_v, row) => row.currentTenant?.since ?? "",
      valueFormatter: (value: string) => (value ? formatDateKey(value) : ""),
    },
    {
      field: "history",
      headerName: "",
      minWidth: 110,
      sortable: false,
      filterable: false,
      disableExport: true,
      renderCell: ({ row }) => (
        <GridCell align="end">
          <Button size="small" onClick={() => setHistoryOf(row)}>
            History
          </Button>
        </GridCell>
      ),
    },
  ];

  return (
    <>
      <DataTable<UnitRow>
        title="Houses"
        subtitle={subtitle}
        rows={rows}
        totalCount={units.length}
        columns={columns}
        getRowId={(row) => row.unitCode}
        rowDensity={showTower ? "standard" : "dense"}
        filters={
          showTower
            ? [{ label: "Show", value: filter, options: HOUSE_FILTERS, onChange: setFilter, defaultValue: "all" }]
            : []
        }
        search={units.length > 8 ? { placeholder: showTower ? "Search house, tower, occupant…" : "Search house, occupant…" } : false}
        label={showTower ? "All houses" : `Houses at ${propertyName}`}
        noRowsLabel="No houses match."
        emptyState={emptyState}
      />
      <HistoryDialog unit={historyOf} onClose={() => setHistoryOf(null)} />
    </>
  );
}

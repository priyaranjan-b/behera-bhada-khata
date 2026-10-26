import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import Link from "@/components/ui/Link";
import { SERVER_TEXT_OPERATORS, type DataTableColDef } from "@/components/ui/DataTable";
import { GridCell } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { AuditEntry } from "@/lib/contracts";
import { routes } from "@/lib/routes";

// The audit_log tables (AuditHistoryTable): Activity (every change) and a
// tenant's Change history, both paged and filtered in SQL (A14). Title, details
// and who are the text stored with each change (0017). The text columns
// offer only the filters the server understands.

const when: DataTableColDef<AuditEntry> = {
  field: "at",
  headerName: "When",
  minWidth: 170,
  valueFormatter: (value: string) => formatDateTime(value),
};

const who: DataTableColDef<AuditEntry> = {
  field: "actorName",
  headerName: "Who",
  minWidth: 140,
  filterOperators: SERVER_TEXT_OPERATORS,
};

const what: DataTableColDef<AuditEntry> = {
  field: "title",
  headerName: "What",
  flex: 1,
  minWidth: 200,
  filterOperators: SERVER_TEXT_OPERATORS,
};

const tenantOrHouse: DataTableColDef<AuditEntry> = {
  field: "tenantName",
  headerName: "Tenant / house",
  flex: 1,
  minWidth: 180,
  valueGetter: (_v, row) => [row.tenantName, row.unitCode].filter(Boolean).join(" "),
  exportValue: (row) => [row.tenantName, row.unitCode].filter(Boolean).join(" · "),
  // Sorted and filtered by the tenant's name in SQL; the house is in the search.
  filterOperators: SERVER_TEXT_OPERATORS,
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
};

const house: DataTableColDef<AuditEntry> = {
  field: "unitCode",
  headerName: "House",
  minWidth: 120,
  filterOperators: SERVER_TEXT_OPERATORS,
};

const details: DataTableColDef<AuditEntry> = {
  field: "details",
  headerName: "Details",
  flex: 2,
  minWidth: 260,
  sortable: false,
  filterOperators: SERVER_TEXT_OPERATORS,
  renderCell: ({ row }) => (
    <GridCell>
      <Typography variant="body2" noWrap title={row.details}>
        {row.details}
      </Typography>
    </GridCell>
  ),
};

/** Activity page: every change, linked to its tenant. */
export const ACTIVITY_COLUMNS = [when, who, what, tenantOrHouse, details];

/** A tenant's Change history: the tenant is the page, so only the house; dates filter with From/To. */
export const TENANT_HISTORY_COLUMNS = [{ ...when, filterable: false }, who, what, house, details];

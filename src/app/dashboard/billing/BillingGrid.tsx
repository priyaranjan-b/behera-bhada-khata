"use client";

import { useMemo, useState } from "react";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import DataTable, {
  moneyColumn,
  type DataTableColDef,
} from "@/components/ui/DataTable";
import { EmptyState, IdentityCell } from "@/components/ui/DataDisplay";
import { StatusChip } from "@/components/domain/StatusChip";
import { apiHref, apiPaths } from "@/lib/api-client/paths";
import type { BillingRow } from "@/lib/contracts";
import { formatDateKey } from "@/lib/dates";
import { periodDisplayStatus } from "@/lib/domain/billing";
import { paymentModeLabel } from "@/lib/domain/payments";
import { statusLabel } from "@/lib/domain/status";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";

type ShowFilter =
  | "all"
  | "unpaid"
  | "partly"
  | "paid"
  | "paidDirect"
  | "notDue";

const SHOW_OPTIONS: { value: ShowFilter; label: string }[] = [
  { value: "all", label: "All months" },
  { value: "unpaid", label: "Unpaid (overdue)" },
  { value: "partly", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "paidDirect", label: "Govt - paid direct" },
  { value: "notDue", label: "Not due yet" },
];

const displayStatus = (row: BillingRow) =>
  row.paidDirect
    ? "paid_direct"
    : periodDisplayStatus(row.status, row.notYetDue);

function matches(row: BillingRow, show: ShowFilter): boolean {
  const status = displayStatus(row);
  switch (show) {
    case "unpaid":
      return status === "pending" || status === "partially_paid";
    case "partly":
      return status === "partially_paid";
    case "paid":
      return status === "paid" || status === "paid_direct";
    case "paidDirect":
      return status === "paid_direct";
    case "notDue":
      return status === "not_due_yet";
    default:
      return true;
  }
}

/** Sort rank: higher = needs the owner more, so a descending sort puts what's owed first. */
const STATUS_RANK: Record<ReturnType<typeof displayStatus>, number> = {
  pending: 4,
  partially_paid: 3,
  not_due_yet: 2,
  paid: 1,
  paid_direct: 0,
};

const PAID_DIRECT_TEXT = "Paid to your bank directly";

const receiptText = (row: BillingRow) =>
  row.paidDirect
    ? PAID_DIRECT_TEXT
    : row.payments
        .map((p) => `${p.receiptNo ?? "—"} (${formatDateKey(p.paymentDate)})`)
        .join(", ");

const columns: DataTableColDef<BillingRow>[] = [
  {
    field: "periodMonth",
    headerName: "Month",
    minWidth: 140,
    flex: 0.7,
    valueFormatter: (_value, row) => row.monthLabel,
  },
  {
    field: "tenantName",
    headerName: "Tenant",
    flex: 1.3,
    minWidth: 200,
    renderCell: ({ row }) => (
      <IdentityCell
        name={row.tenantName}
        caption={row.propertyName}
        href={routes.tenants.detail(row.tenantId)}
      />
    ),
  },
  moneyColumn<BillingRow>("amountDue", "Billed"),
  moneyColumn<BillingRow>("amountAllocated", "Collected"),
  moneyColumn<BillingRow>("balance", "Balance"),
  {
    field: "status",
    headerName: "Status",
    minWidth: 130,
    valueGetter: (_value, row) => statusLabel(displayStatus(row)),
    sortComparator: (_v1, _v2, p1, p2) => {
      const a = p1.api.getRow(p1.id) as BillingRow | null;
      const b = p2.api.getRow(p2.id) as BillingRow | null;
      if (!a || !b) return 0;
      return (
        STATUS_RANK[displayStatus(a)] - STATUS_RANK[displayStatus(b)] ||
        a.balance - b.balance
      );
    },
    renderCell: ({ row }) => <StatusChip status={displayStatus(row)} />,
  },
  {
    field: "payments",
    headerName: "Paid by",
    flex: 1.4,
    minWidth: 230,
    sortable: false,
    valueGetter: (_value, row) => receiptText(row),
    exportValue: (row) => receiptText(row),
    renderCell: ({ row }) =>
      row.paidDirect ? (
        <Typography variant="caption" color="textSecondary">
          {PAID_DIRECT_TEXT}
        </Typography>
      ) : row.payments.length === 0 ? (
        "—"
      ) : (
        <Stack spacing={0.25} sx={{ py: 0.5 }}>
          {row.payments.map((p) => (
            <Typography
              key={p.paymentId}
              variant="caption"
              component="div"
              noWrap
            >
              <MuiLink
                href={apiHref(apiPaths.dashboard.payments.receipt(p.paymentId))}
                aria-label={`Receipt ${p.receiptNo ?? ""} for ${row.tenantName}`}
              >
                {p.receiptNo ?? "Receipt"}
              </MuiLink>
              {` · ${formatDateKey(p.paymentDate)} · ${paymentModeLabel(p.mode)} · ${formatMoney(p.amount)}`}
            </Typography>
          ))}
        </Stack>
      ),
  },
];

/** Every tenant's rent for each month in the range, with what paid it. */
export default function BillingGrid({
  rows,
  rangeLabel,
}: {
  rows: BillingRow[];
  rangeLabel: string;
}) {
  const [show, setShow] = useState<ShowFilter>("all");
  const filtered = useMemo(
    () => rows.filter((row) => matches(row, show)),
    [rows, show],
  );
  const filters = useMemo(
    () => [
      {
        label: "Show",
        value: show,
        options: SHOW_OPTIONS,
        onChange: setShow,
        defaultValue: "all" as const,
      },
    ],
    [show],
  );

  return (
    <DataTable<BillingRow>
      title="Billing & collection"
      subtitle={`Rent per tenant per month, ${rangeLabel}`}
      rows={filtered}
      totalCount={rows.length}
      filters={filters}
      columns={columns}
      getRowId={(row) => row.id}
      search={{ placeholder: "Search tenant or receipt…" }}
      rowDensity="standard"
      noRowsLabel="No months match."
      emptyState={
        <EmptyState
          icon={<ReceiptLongRoundedIcon />}
          title="Nothing billed in these months"
          description="Rent months appear here once a tenant is billed for them."
        />
      }
      initialState={{
        sorting: { sortModel: [{ field: "amountAllocated", sort: "desc" }] },
      }}
    />
  );
}

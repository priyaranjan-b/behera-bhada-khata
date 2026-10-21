import Link from "@/components/Link";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import AddIcon from "@mui/icons-material/Add";
import { createClient } from "@/lib/supabase/server";
import { ensureRentPeriods, currentMonthKey } from "@/lib/periods";
import { summarizeBalance } from "@/lib/allocation";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/StatusChip";
import { formatUnitLabel, tenantDisplayName } from "@/lib/tenant";
import { buildTenantLedger } from "@/lib/tenantLedger";
import TenantLedgerTable from "./TenantLedgerTable";

function formatMonth(periodMonth: string) {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ paymentCreated?: string; resent?: string; error?: string }>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "id, name, business_name, unit_type, tower, floor, house_number, phone, monthly_rent_amount, property_id"
    )
    .eq("id", tenantId)
    .single();
  if (!tenant) notFound();

  const displayName = tenantDisplayName(tenant);
  const unitLabel = formatUnitLabel(tenant);

  const { data: property } = await supabase
    .from("properties")
    .select("name")
    .eq("id", tenant.property_id)
    .single();
  const propertyName = property?.name;

  await ensureRentPeriods(tenantId);

  const { data: periods } = await supabase
    .from("rent_periods")
    .select("id, period_month, amount_due, amount_allocated, status")
    .eq("tenant_id", tenantId)
    .order("period_month", { ascending: true });

  const summary = summarizeBalance(periods ?? [], currentMonthKey());

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, mode, status, note")
    .eq("tenant_id", tenantId);

  const { data: adjustments } = await supabase
    .from("adjustments")
    .select("id, delta_amount, reason, status, created_at, confirmed_at")
    .eq("tenant_id", tenantId);

  const ledgerRows = buildTenantLedger(periods ?? [], payments ?? [], adjustments ?? []);

  return (
    <Stack spacing={4}>
      <Box>
        <Typography
          component={Link}
          href={`/dashboard/properties/${tenant.property_id}`}
          variant="body2"
          color="textSecondary"
          sx={{ textDecoration: "none" }}
        >
          &larr; {propertyName ?? "Property"}
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {displayName}
              </Typography>
              <Chip size="small" variant="outlined" label={tenant.unit_type} />
            </Stack>
            <Typography variant="body2" color="textSecondary">
              {tenant.business_name ? `${tenant.name} · ` : ""}
              {tenant.phone}
              {unitLabel ? ` · ${unitLabel}` : ""} · {formatMoney(tenant.monthly_rent_amount)}/mo
            </Typography>
          </Box>
          <Button
            component={Link}
            href={`/dashboard/tenants/${tenantId}/payments/new`}
            variant="contained"
            startIcon={<AddIcon />}
          >
            Record payment
          </Button>
        </Stack>
      </Box>

      {flash.paymentCreated ? <Alert severity="success">Payment recorded and sent for confirmation.</Alert> : null}
      {flash.resent ? <Alert severity="success">Confirmation link resent.</Alert> : null}
      {flash.error ? <Alert severity="error">Something went wrong.</Alert> : null}

      <Alert severity={summary.totalOutstanding > 0 ? "warning" : "success"}>
        Outstanding: <strong>{formatMoney(summary.totalOutstanding)}</strong>
        {summary.overdueMonths > 0 ? ` (${summary.overdueMonths} month(s) overdue)` : ""}
      </Alert>

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Months
        </Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell align="right">Allocated</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(periods ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatMonth(p.period_month)}</TableCell>
                  <TableCell align="right">{formatMoney(p.amount_due)}</TableCell>
                  <TableCell align="right">{formatMoney(p.amount_allocated)}</TableCell>
                  <TableCell>
                    <StatusChip status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Ledger
        </Typography>
        <TenantLedgerTable rows={ledgerRows} tenantId={tenantId} />
      </Box>
    </Stack>
  );
}

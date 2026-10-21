import Link from "@/components/Link";
import { addMonths, format, startOfMonth } from "date-fns";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import GroupsIcon from "@mui/icons-material/Groups";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import { createClient } from "@/lib/supabase/server";
import { ensureRentPeriods, currentMonthKey } from "@/lib/periods";
import { buildMonthlyReport, buildBillingCollectionTrend } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import type { RentPeriod } from "@/lib/types";
import { StatusChip } from "@/components/StatusChip";
import { tenantDisplayName } from "@/lib/tenant";
import BillingCollectionChart from "@/components/BillingCollectionChart";
import theme from "@/theme";

const TREND_MONTHS = 6;

function parseMonthParam(month?: string): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  return currentMonthKey();
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "error";
}) {
  const main = theme.palette[tone].main;
  return (
    <Paper sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: alpha(main, 0.12),
          color: main,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="textSecondary" noWrap>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthKey = parseMonthParam(month);
  const monthDate = new Date(`${monthKey}T00:00:00Z`);
  const prevMonth = format(addMonths(monthDate, -1), "yyyy-MM");
  const nextMonth = format(addMonths(monthDate, 1), "yyyy-MM");
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const supabase = await createClient();

  const { data: properties } = await supabase.from("properties").select("id, name");

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, business_name, property_id")
    .eq("status", "active");

  const propertyNameById = new Map((properties ?? []).map((p) => [p.id, p.name]));

  for (const tenant of tenants ?? []) {
    await ensureRentPeriods(tenant.id);
  }

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: periods } = tenantIds.length
    ? await supabase
        .from("rent_periods")
        .select("id, tenant_id, period_month, amount_due, amount_allocated, status, created_at")
        .in("tenant_id", tenantIds)
    : { data: [] as RentPeriod[] };

  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods ?? []) {
    const list = periodsByTenant.get(period.tenant_id) ?? [];
    list.push(period);
    periodsByTenant.set(period.tenant_id, list);
  }

  const reportTenants = (tenants ?? []).map((t) => ({
    id: t.id,
    name: tenantDisplayName(t),
    propertyName: propertyNameById.get(t.property_id) ?? "Property",
  }));

  const report = buildMonthlyReport(reportTenants, periodsByTenant, monthKey, currentMonthKey());

  const { data: paymentsForTrend } = tenantIds.length
    ? await supabase
        .from("payments")
        .select("amount, payment_date")
        .in("tenant_id", tenantIds)
        .eq("status", "confirmed")
    : { data: [] as { amount: string; payment_date: string }[] };

  const { data: adjustmentsForTrend } = tenantIds.length
    ? await supabase
        .from("adjustments")
        .select("delta_amount, confirmed_at")
        .in("tenant_id", tenantIds)
        .eq("status", "confirmed")
    : { data: [] as { delta_amount: string; confirmed_at: string | null }[] };

  const trendMonthKeys = Array.from({ length: TREND_MONTHS }, (_, i) =>
    format(addMonths(startOfMonth(new Date()), i - (TREND_MONTHS - 1)), "yyyy-MM")
  );
  const trend = buildBillingCollectionTrend(
    periods ?? [],
    paymentsForTrend ?? [],
    adjustmentsForTrend ?? [],
    trendMonthKeys
  );

  return (
    <Stack spacing={5}>
      <Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              Monthly summary
            </Typography>
            <Typography variant="body2" color="textSecondary">
              How rent is tracking across every property this month.
            </Typography>
          </Box>
          <Paper sx={{ display: "flex", alignItems: "center", px: 0.5, py: 0.5, borderRadius: 3 }}>
            <IconButton component={Link} href={`/dashboard?month=${prevMonth}`} size="small">
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 140, textAlign: "center", fontWeight: 600 }}>
              {monthLabel}
            </Typography>
            <IconButton component={Link} href={`/dashboard?month=${nextMonth}`} size="small">
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Paper>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard label="Expected this month" value={formatMoney(report.expected)} icon={<AttachMoneyIcon />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Collected this month"
              value={formatMoney(report.collected)}
              icon={<CheckCircleIcon />}
              tone="success"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Outstanding (all-time)"
              value={formatMoney(report.outstanding)}
              icon={<WarningAmberIcon />}
              tone={report.outstanding > 0 ? "warning" : "success"}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              label="Tenants overdue"
              value={String(report.overdueTenantCount)}
              icon={<GroupsIcon />}
              tone={report.overdueTenantCount > 0 ? "error" : "success"}
            />
          </Grid>
        </Grid>
      </Box>

      <BillingCollectionChart data={trend} />

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          Tenants
        </Typography>
        {report.rows.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: "center" }}>
            <PeopleOutlineIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              No active tenants yet
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Add a property and a tenant to start tracking rent.
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Property</TableCell>
                  <TableCell align="right">Due</TableCell>
                  <TableCell align="right">Collected</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.tenantId} hover>
                    <TableCell>
                      <Box
                        component={Link}
                        href={`/dashboard/tenants/${row.tenantId}`}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          color: "inherit",
                          textDecoration: "none",
                        }}
                      >
                        <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 13 }}>
                          {initials(row.tenantName)}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.tenantName}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">
                        {row.propertyName}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatMoney(row.monthDue)}</TableCell>
                    <TableCell align="right">{formatMoney(row.monthAllocated)}</TableCell>
                    <TableCell>
                      <StatusChip status={row.monthStatus} />
                    </TableCell>
                    <TableCell align="right">
                      {row.totalOutstanding > 0 ? (
                        <Chip
                          size="small"
                          color={row.overdueMonths > 0 ? "error" : "warning"}
                          label={
                            formatMoney(row.totalOutstanding) +
                            (row.overdueMonths > 0 ? ` · ${row.overdueMonths}mo overdue` : "")
                          }
                        />
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Stack>
  );
}

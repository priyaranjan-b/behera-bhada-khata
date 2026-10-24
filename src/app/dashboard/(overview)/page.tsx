import Link from "@/components/ui/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutlineOutlined";
import { serverApi } from "@/lib/api-client/server";
import type { MonthlyTrendPoint } from "@/lib/domain/reports";
import { addMonthsToKey, formatMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import BillingCollectionChart from "@/components/domain/BillingCollectionChart";
import StatCard, { type Trend } from "@/components/ui/StatCard";
import { EmptyState, PageHeader } from "@/components/ui/DataDisplay";
import { InsetBox } from "@/components/ui";
import TenantStatusGrid from "./TenantStatusGrid";

/** Where the Expected / Collected cards jump to on this page. */
const MONTH_TENANTS_ANCHOR = "month-tenants";

// Direction of the last month vs the one before, for sparkline colouring.
function trendOf(values: number[]): Trend {
  const [prev, last] = values.slice(-2);
  if (prev === undefined || last === undefined || last === prev) return "neutral";
  return last > prev ? "up" : "down";
}

function sparklineFor(trend: MonthlyTrendPoint[], key: "billed" | "collected") {
  const data = trend.map((p) => p[key]);
  return { data, labels: trend.map((p) => p.label), trend: trendOf(data), format: "money" as const };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; show?: string }>;
}) {
  const { month, show } = await searchParams;
  const { monthKey, report, trend, houses } = await serverApi.dashboard.summary(month);
  const prevMonth = addMonthsToKey(monthKey, -1).slice(0, 7);
  const nextMonth = addMonthsToKey(monthKey, 1).slice(0, 7);
  const monthLabel = formatMonth(monthKey);
  // Expected / Collected open this page's Tenants table for the same month, pre-filtered.
  const monthTable = (filter: string) =>
    `/dashboard?month=${monthKey.slice(0, 7)}&show=${filter}#${MONTH_TENANTS_ANCHOR}`;

  const collectionRate = report.expected > 0 ? Math.round((report.collected / report.expected) * 100) : null;
  const activeTenants = report.rows.length;

  const monthSwitcher = (
    <InsetBox>
      <IconButton component={Link} href={`/dashboard?month=${prevMonth}`} size="small" aria-label="Previous month">
        <ChevronLeftRoundedIcon fontSize="small" />
      </IconButton>
      <Typography variant="subtitle2" align="center" sx={{ minWidth: 128 }} aria-live="polite">
        {monthLabel}
      </Typography>
      <IconButton component={Link} href={`/dashboard?month=${nextMonth}`} size="small" aria-label="Next month">
        <ChevronRightRoundedIcon fontSize="small" />
      </IconButton>
    </InsetBox>
  );

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Overview"
        subtitle="How rent is tracking across every property."
        action={monthSwitcher}
      />

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            title="Expected"
            value={formatMoney(report.expected)}
            caption={`Rent due for ${monthLabel}`}
            badge={{ label: `${activeTenants} tenant${activeTenants === 1 ? "" : "s"}`, tone: "info" }}
            sparkline={sparklineFor(trend, "billed")}
            href={monthTable("due")}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            title="Collected"
            value={formatMoney(report.collected)}
            caption={`Allocated to ${monthLabel}`}
            badge={
              collectionRate === null
                ? undefined
                : {
                    label: `${collectionRate}%`,
                    tone: collectionRate >= 90 ? "success" : collectionRate >= 60 ? "warning" : "danger",
                  }
            }
            sparkline={sparklineFor(trend, "collected")}
            href={monthTable("collected")}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            title="Outstanding"
            value={formatMoney(report.outstanding)}
            caption="Rent unpaid to the end of last month"
            badge={report.outstanding > 0 ? { label: "To collect", tone: "warning" } : { label: "All clear", tone: "success" }}
            href="/dashboard/defaulters"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            title="Tenants overdue"
            value={String(report.overdueTenantCount)}
            caption="With at least one month past due"
            href="/dashboard/tenants?show=overdue"
            badge={
              report.overdueTenantCount > 0
                ? { label: "Follow up", tone: "danger" }
                : { label: "On track", tone: "success" }
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            title="Vacant houses"
            value={String(houses.vacant)}
            caption={`Of ${houses.total} house${houses.total === 1 ? "" : "s"} in use`}
            badge={houses.vacant > 0 ? { label: "To let", tone: "info" } : { label: "All let", tone: "success" }}
            href="/dashboard/houses?show=vacant"
          />
        </Grid>
      </Grid>

      <BillingCollectionChart data={trend} />

      <TenantStatusGrid
        key={`${monthKey}-${show ?? ""}`}
        id={MONTH_TENANTS_ANCHOR}
        initialShow={show}
        rows={report.rows}
        monthLabel={monthLabel}
        emptyState={
          <EmptyState
            icon={<PeopleOutlineIcon />}
            title="No active tenants yet"
            description="Add a property and a tenant to start tracking rent."
          />
        }
      />
    </Stack>
  );
}

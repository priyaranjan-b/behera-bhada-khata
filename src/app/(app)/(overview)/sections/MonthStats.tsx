import Grid from "@mui/material/Grid";
import type { OverviewMonth, OverviewTrend } from "@/lib/contracts";
import { formatMonth, yearMonthOf } from "@/lib/dates";
import { collectionRateTone } from "@/lib/domain/overview";
import type { MonthlyTrendPoint } from "@/lib/domain/reports";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import StatCard, { type Trend } from "@/components/ui/StatCard";

/** Grid cell of one stat card; the Vacant card (its own section) sits in the same row. */
export const STAT_CELL = { xs: 6, lg: "grow" } as const;

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

/** Overview: Expected, Collected, Outstanding and Tenants overdue - four grid cells. */
export default async function MonthStats({
  month,
  trend,
}: {
  month: Promise<OverviewMonth>;
  trend: Promise<OverviewTrend>;
}) {
  const [{ monthKey, report }, { trend: points }] = await Promise.all([month, trend]);
  const monthLabel = formatMonth(monthKey);
  // Expected / Collected open the Billing page for the same month.
  const monthBilling = routes.billing({ from: yearMonthOf(monthKey), to: yearMonthOf(monthKey) });
  const collectionRate = report.expected > 0 ? Math.round((report.collected / report.expected) * 100) : null;
  const activeTenants = report.rows.length;

  return (
    <>
      <Grid size={STAT_CELL}>
        <StatCard
          title="Expected"
          value={formatMoney(report.expected)}
          caption={`Rent due for ${monthLabel}`}
          badge={{ label: `${activeTenants} tenant${activeTenants === 1 ? "" : "s"}`, tone: "info" }}
          sparkline={sparklineFor(points, "billed")}
          href={monthBilling}
        />
      </Grid>
      <Grid size={STAT_CELL}>
        <StatCard
          title="Collected"
          value={formatMoney(report.collected)}
          caption={`Allocated to ${monthLabel}`}
          badge={
            collectionRate === null
              ? undefined
              : { label: `${collectionRate}%`, tone: collectionRateTone(collectionRate) }
          }
          sparkline={sparklineFor(points, "collected")}
          href={monthBilling}
        />
      </Grid>
      <Grid size={STAT_CELL}>
        <StatCard
          title="Outstanding"
          value={formatMoney(report.outstanding)}
          caption="Rent unpaid to the end of last month"
          badge={report.outstanding > 0 ? { label: "To collect", tone: "warning" } : { label: "All clear", tone: "success" }}
          href={routes.defaulters}
        />
      </Grid>
      <Grid size={STAT_CELL}>
        <StatCard
          title="Tenants overdue"
          value={String(report.overdueTenantCount)}
          caption="With at least one month past due"
          href={routes.tenants.list({ show: "overdue" })}
          badge={
            report.overdueTenantCount > 0
              ? { label: "Follow up", tone: "danger" }
              : { label: "On track", tone: "success" }
          }
        />
      </Grid>
    </>
  );
}

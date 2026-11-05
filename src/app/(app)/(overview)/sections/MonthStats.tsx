import type { StatCardRowColumns } from "@/components/ui/StatCardRow";
import type { OverviewMonth, OverviewTrend } from "@/lib/contracts";
import { formatMonth, yearMonthOf } from "@/lib/dates";
import { collectionRateTone } from "@/lib/domain/overview";
import type { MonthlyTrendPoint } from "@/lib/domain/reports";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import StatCard, { type Trend } from "@/components/ui/StatCard";

/**
 * The Overview's five stat cards (Vacant, its own section, is the fifth): a
 * swipe row on phones, three a row, all five from `xl`. Not from `lg`: at
 * 1200px a lakh-sized figure ("₹2,31,260.00") doesn't fit a fifth of the row (A26).
 */
export const STAT_COLUMNS = { sm: 3, xl: 5 } as const satisfies StatCardRowColumns;

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

/** Overview: Expected, Collected, Outstanding and Tenants overdue - four cards in the stat row (Vacant, its own section, makes five). */
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
  // "Collected" is what was credited to this month's rent; the chart's bars are
  // cash received in the month, which differs whenever arrears are paid (A20).
  const received = points.find((p) => p.monthKey === yearMonthOf(monthKey))?.collected;

  return (
    <>
      <StatCard
        title="Expected"
        icon={<ReceiptLongRoundedIcon />}
        value={formatMoney(report.expected)}
        caption={`Rent due for ${monthLabel}`}
        badge={{ label: `${activeTenants} tenant${activeTenants === 1 ? "" : "s"}`, tone: "info" }}
        sparkline={sparklineFor(points, "billed")}
        href={monthBilling}
      />
      <StatCard
        title="Collected"
        icon={<SavingsRoundedIcon />}
        value={formatMoney(report.collected)}
        caption={`For ${monthLabel}'s rent`}
        note={received === undefined ? undefined : `${formatMoney(received)} received in the month`}
        badge={
          collectionRate === null
            ? undefined
            : { label: `${collectionRate}%`, tone: collectionRateTone(collectionRate) }
        }
        sparkline={sparklineFor(points, "collected")}
        href={monthBilling}
      />
      <StatCard
        title="Outstanding"
        icon={<PendingActionsRoundedIcon />}
        variant={report.outstanding > 0 ? "highlighted" : "default"}
        value={formatMoney(report.outstanding)}
        caption="Rent unpaid to the end of last month"
        badge={report.outstanding > 0 ? { label: "To collect", tone: "warning" } : { label: "All clear", tone: "success" }}
        href={routes.defaulters}
      />
      <StatCard
        title="Tenants overdue"
        icon={<PeopleAltRoundedIcon />}
        value={String(report.overdueTenantCount)}
        // As of today, like Outstanding, whatever month the bar shows.
        caption="Behind on rent to the end of last month"
        href={routes.tenants.list({ show: "overdue" })}
        badge={
          report.overdueTenantCount > 0
            ? { label: "Follow up", tone: "danger" }
            : { label: "On track", tone: "success" }
        }
      />
    </>
  );
}

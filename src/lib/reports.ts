import { summarizeBalance } from "@/lib/allocation";
import { round2 } from "@/lib/money";
import type { RentPeriod, PeriodStatus } from "@/lib/types";

export interface TenantMonthRow {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  monthDue: number;
  monthAllocated: number;
  monthStatus: PeriodStatus;
  totalOutstanding: number;
  overdueMonths: number;
}

export interface MonthlyReport {
  expected: number;
  collected: number;
  outstanding: number;
  overdueTenantCount: number;
  rows: TenantMonthRow[];
}

// Pure aggregation - the caller fetches tenants/periods and ensures periods
// exist for the target month (ensureRentPeriods) beforehand.
export function buildMonthlyReport(
  tenants: { id: string; name: string; propertyName: string }[],
  periodsByTenant: Map<string, RentPeriod[]>,
  monthKey: string,
  todayMonthKey: string
): MonthlyReport {
  let expected = 0;
  let collected = 0;
  let outstanding = 0;
  let overdueTenantCount = 0;
  const rows: TenantMonthRow[] = [];

  for (const tenant of tenants) {
    const periods = periodsByTenant.get(tenant.id) ?? [];
    const balance = summarizeBalance(periods, todayMonthKey);
    const monthPeriod = periods.find((p) => p.period_month === monthKey);

    const monthDue = monthPeriod ? Number(monthPeriod.amount_due) : 0;
    const monthAllocated = monthPeriod ? Number(monthPeriod.amount_allocated) : 0;

    expected += monthDue;
    collected += monthAllocated;
    outstanding += balance.totalOutstanding;
    if (balance.overdueMonths > 0) overdueTenantCount += 1;

    rows.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      propertyName: tenant.propertyName,
      monthDue,
      monthAllocated,
      monthStatus: monthPeriod?.status ?? "pending",
      totalOutstanding: balance.totalOutstanding,
      overdueMonths: balance.overdueMonths,
    });
  }

  return {
    expected: round2(expected),
    collected: round2(collected),
    outstanding: round2(outstanding),
    overdueTenantCount,
    rows,
  };
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  billed: number;
  collected: number;
}

// Cash-flow view (distinct from buildMonthlyReport's accrual view): "billed"
// is still what came due in that calendar month, but "collected" here is
// money that actually arrived in that month - confirmed payments by
// payment_date and confirmed adjustments by confirmed_at - regardless of
// which month's rent it was allocated against. A tenant paying 3 months of
// arrears in one go shows the whole amount in the month they actually paid.
export function buildBillingCollectionTrend(
  periods: { period_month: string; amount_due: number | string }[],
  payments: { amount: number | string; payment_date: string }[],
  adjustments: { delta_amount: number | string; confirmed_at: string | null }[],
  monthKeys: string[]
): MonthlyTrendPoint[] {
  const billedByMonth = new Map<string, number>();
  for (const period of periods) {
    const key = period.period_month.slice(0, 7);
    billedByMonth.set(key, round2((billedByMonth.get(key) ?? 0) + Number(period.amount_due)));
  }

  const collectedByMonth = new Map<string, number>();
  for (const payment of payments) {
    const key = payment.payment_date.slice(0, 7);
    collectedByMonth.set(key, round2((collectedByMonth.get(key) ?? 0) + Number(payment.amount)));
  }
  for (const adjustment of adjustments) {
    if (!adjustment.confirmed_at) continue;
    const key = adjustment.confirmed_at.slice(0, 7);
    collectedByMonth.set(key, round2((collectedByMonth.get(key) ?? 0) + Number(adjustment.delta_amount)));
  }

  return monthKeys.map((key) => ({
    monthKey: key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric" }),
    billed: billedByMonth.get(key) ?? 0,
    collected: collectedByMonth.get(key) ?? 0,
  }));
}

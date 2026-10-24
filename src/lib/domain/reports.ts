import { summarizeBalance, type PeriodLike } from "@/lib/domain/allocation";
import { dateKeyOf, formatMonth } from "@/lib/dates";
import { round2 } from "@/lib/money";
import type { RentPeriod, PeriodStatus } from "@/lib/types";

export interface TenantMonthRow {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  /** A former tenant shown because they still owe. */
  movedOut: boolean;
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
  tenants: { id: string; name: string; propertyName: string; movedOut?: boolean }[],
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
      movedOut: tenant.movedOut ?? false,
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
    // A timestamp: bucket it by the app-time-zone day it happened on.
    const key = dateKeyOf(adjustment.confirmed_at).slice(0, 7);
    collectedByMonth.set(key, round2((collectedByMonth.get(key) ?? 0) + Number(adjustment.delta_amount)));
  }

  return monthKeys.map((key) => ({
    monthKey: key,
    label: formatMonth(key, "short"),
    billed: billedByMonth.get(key) ?? 0,
    collected: collectedByMonth.get(key) ?? 0,
  }));
}

// ---- Defaulters / aging -------------------------------------------------------

/**
 * Age bands. A month's age is how many months ago it ended: last month is 1.
 * A tenant's band is by how many months they're behind (`overdueMonths`).
 */
export const AGING_BUCKETS = [
  { key: "m1", label: "1 month", min: 1, max: 1 },
  { key: "m2to3", label: "2–3 months", min: 2, max: 3 },
  { key: "m4to6", label: "4–6 months", min: 4, max: 6 },
  { key: "m7plus", label: "Over 6 months", min: 7, max: Infinity },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucketOf(months: number): AgingBucketKey | null {
  return AGING_BUCKETS.find((b) => months >= b.min && months <= b.max)?.key ?? null;
}

function monthsBefore(monthKey: string, todayMonthKey: string): number {
  const months = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7));
  return months(todayMonthKey) - months(monthKey);
}

export interface TenantAging {
  /** Ended months with something unpaid. */
  overdueMonths: number;
  totalOutstanding: number;
  /** Earliest ended month still unpaid (yyyy-MM-01), or null. */
  oldestUnpaidMonth: string | null;
  /** Unpaid rent by the age of the month it's for. */
  byAge: Record<AgingBucketKey, number>;
}

/** Arrears for one tenant; counts only months before `todayMonthKey`, like summarizeBalance. */
export function agingOf(periods: PeriodLike[], todayMonthKey: string): TenantAging {
  const byAge = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0])) as Record<AgingBucketKey, number>;
  let oldestUnpaidMonth: string | null = null;
  for (const period of periods) {
    const unpaid = round2(Number(period.amount_due) - Number(period.amount_allocated));
    if (unpaid <= 0 || period.period_month >= todayMonthKey) continue;
    const bucket = agingBucketOf(monthsBefore(period.period_month, todayMonthKey));
    if (bucket) byAge[bucket] = round2(byAge[bucket] + unpaid);
    if (!oldestUnpaidMonth || period.period_month < oldestUnpaidMonth) oldestUnpaidMonth = period.period_month;
  }
  const { totalOutstanding, overdueMonths } = summarizeBalance(periods, todayMonthKey);
  return { overdueMonths, totalOutstanding, oldestUnpaidMonth, byAge };
}

/** Most months behind first, then most owed, then the oldest debt. */
export function compareAging(a: TenantAging, b: TenantAging): number {
  return (
    b.overdueMonths - a.overdueMonths ||
    b.totalOutstanding - a.totalOutstanding ||
    (a.oldestUnpaidMonth ?? "").localeCompare(b.oldestUnpaidMonth ?? "")
  );
}

export interface AgingGroup {
  key: AgingBucketKey;
  label: string;
  tenantCount: number;
  /** What the tenants in this band owe in total. */
  outstanding: number;
}

/** Tenants grouped by how many months they're behind. */
export function agingGroups(rows: TenantAging[]): AgingGroup[] {
  return AGING_BUCKETS.map(({ key, label }) => {
    const inBand = rows.filter((r) => agingBucketOf(r.overdueMonths) === key);
    return {
      key,
      label,
      tenantCount: inBand.length,
      outstanding: round2(inBand.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    };
  });
}

// Pure functions only (no "server-only" import) - this module is shared by
// server components/routes and by the client-side payment form, which needs
// to recompute the same oldest-first suggestion as the owner types an amount.
import { round2 } from "@/lib/money";

export interface PeriodLike {
  id: string;
  period_month: string;
  amount_due: number | string;
  amount_allocated: number | string;
}

export interface AllocationSuggestion {
  rentPeriodId: string;
  periodMonth: string;
  amountDue: number;
  amountOutstanding: number;
  amountAllocated: number;
}

export function suggestAllocations(
  pendingPeriods: PeriodLike[],
  paymentAmount: number
): AllocationSuggestion[] {
  const sorted = [...pendingPeriods].sort((a, b) => a.period_month.localeCompare(b.period_month));
  let remaining = round2(paymentAmount);
  const result: AllocationSuggestion[] = [];

  for (const period of sorted) {
    if (remaining <= 0) break;
    const outstanding = round2(Number(period.amount_due) - Number(period.amount_allocated));
    if (outstanding <= 0) continue;
    const allocated = round2(Math.min(outstanding, remaining));
    result.push({
      rentPeriodId: period.id,
      periodMonth: period.period_month,
      amountDue: Number(period.amount_due),
      amountOutstanding: outstanding,
      amountAllocated: allocated,
    });
    remaining = round2(remaining - allocated);
  }

  return result;
}

export interface TenantBalanceSummary {
  totalOutstanding: number;
  overdueMonths: number;
}

export function summarizeBalance(periods: PeriodLike[], todayMonthKey: string): TenantBalanceSummary {
  let totalOutstanding = 0;
  let overdueMonths = 0;

  for (const period of periods) {
    const outstanding = round2(Number(period.amount_due) - Number(period.amount_allocated));
    if (outstanding > 0) {
      totalOutstanding = round2(totalOutstanding + outstanding);
      if (period.period_month < todayMonthKey) overdueMonths += 1;
    }
  }

  return { totalOutstanding, overdueMonths };
}

import "server-only";
import type { BillingPage, BillingReceived, BillingRow, BillingTotalsView } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, monthKeyOf } from "@/lib/dates";
import { monthsIn, resolveRange, type MonthRange } from "@/lib/domain/billing";
import { round2 } from "@/lib/money";
import { BILLING_LIMITS, billingPageQuerySchema, billingQuerySchema } from "@/lib/validation";
import { parseInput, type OwnerContext } from "./context";
import { billedTenants, db, paymentsFrom, placements, tenantsList } from "./loaders";
import { paidDirectPeriods } from "./periods";

// The Billing page loads in sections (A12): the grid (one page at a time,
// paged in SQL, A15), the totals of the whole range, and the cash received in
// the range (a different query). The paid-direct switch is its own call
// (./paidDirect).

/** `?from&to&paidDirect` -> the range (default: this month, the latest that has fallen due) and the view. */
function parseQuery(query: unknown): { range: MonthRange; latestMonth: string; showPaidDirect: boolean } {
  const input = parseInput(billingQuerySchema, query ?? {});
  const latestMonth = currentMonthKey();
  return {
    range: resolveRange(input, latestMonth, BILLING_LIMITS.maxMonths),
    latestMonth,
    showPaidDirect: input.paidDirect === "show",
  };
}

// The grid's fields → the columns billing_page reads.
const SORT_COLUMNS = {
  periodMonth: "period_month",
  tenantName: "tenant_name",
  amountDue: "amount_due",
  amountAllocated: "amount_allocated",
  balance: "balance",
  status: "status",
} as const;
const FILTER_COLUMNS = { periodMonth: "month", tenantName: "tenant", status: "status", payments: "payments" } as const;

/**
 * One page of the Billing grid: every tenant's rent for each month in the
 * range (plus government rent paid direct, A11), with what paid it - paged,
 * sorted, searched and filtered in SQL (billing_page, A15).
 */
export async function getBillingPage(_ctx: OwnerContext, query: unknown = {}): Promise<BillingPage> {
  const input = parseInput(billingPageQuerySchema, query ?? {});
  const range = resolveRange(input, currentMonthKey(), BILLING_LIMITS.maxMonths);
  // Months exist before they're read: the same top-up every billing read does.
  const [, repos] = await Promise.all([billedTenants(), db()]);
  const result = await repos.billing.page({
    ...range,
    paidDirect: input.paidDirect === "show",
    show: input.show,
    search: input.q || undefined,
    filters: input.filters.map((f) => ({ ...f, field: FILTER_COLUMNS[f.field] })),
    logic: input.logic,
    sort: SORT_COLUMNS[input.sort],
    dir: input.dir,
    page: input.page,
    pageSize: input.pageSize,
  });
  return {
    ...range,
    rows: result.rows.map(
      (r): BillingRow => ({
        id: r.id,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        propertyName: r.property_name,
        unitCodes: r.unit_codes,
        periodMonth: r.period_month,
        monthLabel: r.month_label,
        amountDue: Number(r.amount_due),
        amountAllocated: Number(r.amount_allocated),
        balance: Number(r.balance),
        status: r.status,
        notYetDue: r.not_yet_due,
        payments: r.payments.map((p) => ({
          paymentId: p.payment_id,
          receiptNo: p.receipt_no,
          paymentDate: p.payment_date,
          mode: p.mode,
          amount: Number(p.amount),
        })),
        paidDirect: r.paid_direct,
      })
    ),
    total: result.total,
    all: result.all,
    page: result.page,
  };
}

/** The Billing stat cards: billed, collected, balance, overdue and tenants for the whole range. */
export async function getBillingTotals(_ctx: OwnerContext, query: unknown = {}): Promise<BillingTotalsView> {
  const { range, showPaidDirect } = parseQuery(query);
  const [, repos] = await Promise.all([billedTenants(), db()]);
  const t = await repos.billing.totals({ ...range, paidDirect: showPaidDirect });
  return {
    billed: Number(t.billed),
    collected: Number(t.collected),
    balance: Number(t.balance),
    overdue: Number(t.overdue),
    collectionRate: t.collection_rate,
    tenants: t.tenants,
  };
}

/**
 * Cash view: money that arrived in the range's calendar months, whatever
 * months it paid for - recorded payments, plus government rent paid direct
 * for those months up to this one (A11) unless hidden.
 */
export async function getBillingReceived(_ctx: OwnerContext, query: unknown = {}): Promise<BillingReceived> {
  const { range, latestMonth, showPaidDirect } = parseQuery(query);
  const [allTenants, placement, rangePayments] = await Promise.all([
    tenantsList(),
    placements(),
    paymentsFrom(range.from),
  ]);
  const afterRange = addMonthsToKey(range.to, 1);
  const inRange = rangePayments.filter((p) => monthKeyOf(p.payment_date) < afterRange);
  const direct = showPaidDirect ? paidDirectPeriods(allTenants, placement.ratesByTenant, monthsIn(range)) : [];
  const paidDirect = round2(
    direct.filter((p) => p.period_month <= latestMonth).reduce((sum, p) => sum + Number(p.amount_allocated), 0)
  );
  const recorded = inRange.reduce((sum, p) => sum + Number(p.amount), 0);
  return { amount: round2(recorded + paidDirect), payments: inRange.length, paidDirect };
}

import "server-only";
import type { PaymentListRow, PaymentsPage, PaymentsPaidDirect } from "@/lib/contracts";
import { currentMonthKey } from "@/lib/dates";
import { monthsIn } from "@/lib/domain/billing";
import { monthsOfDayRange, resolveDayRange } from "@/lib/domain/payments";
import { round2 } from "@/lib/money";
import { PAYMENTS_LIMITS, paymentsPageQuerySchema, paymentsQuerySchema } from "@/lib/validation";
import { parseInput, type OwnerContext } from "./context";
import { db, placements, tenantsList } from "./loaders";
import { paidDirectPeriods } from "./periods";

// The Payments page (A18): every tenant's recorded payments by the day they
// were received, paged, searched and totalled per mode in SQL
// (payments_page, 0026), plus government rent paid direct (A11) on its own
// call - it has no date received, so it counts by rent month.

// The grid's fields → the columns payments_page reads.
const SORT_COLUMNS = {
  paymentDate: "payment_date",
  receiptNo: "receipt_no",
  tenantName: "tenant_name",
  mode: "mode",
  amount: "amount",
} as const;
const FILTER_COLUMNS = {
  paymentDate: "date",
  receiptNo: "receipt",
  tenantName: "tenant",
  mode: "mode",
  monthsText: "months",
  note: "note",
} as const;

/** One page of the Payments grid, with the totals per mode of every payment that matches. */
export async function getPaymentsPage(_ctx: OwnerContext, query: unknown = {}): Promise<PaymentsPage> {
  const input = parseInput(paymentsPageQuerySchema, query ?? {});
  const range = resolveDayRange(input, PAYMENTS_LIMITS.maxDays);
  const result = await (await db()).payments.page({
    ...range,
    search: input.q || undefined,
    filters: input.filters.map((f) => ({ ...f, field: FILTER_COLUMNS[f.field] })),
    logic: input.logic,
    sort: SORT_COLUMNS[input.sort],
    dir: input.dir,
    page: input.page,
    pageSize: input.pageSize,
  });
  const t = result.totals;
  return {
    ...range,
    rows: result.rows.map(
      (r): PaymentListRow => ({
        id: r.id,
        receiptNo: r.receipt_no,
        paymentDate: r.payment_date,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        propertyName: r.property_name,
        mode: r.mode,
        amount: Number(r.amount),
        monthsText: r.months_text,
        note: r.note,
        acknowledged: r.acknowledged,
      })
    ),
    total: result.total,
    all: result.all,
    page: result.page,
    totals: {
      amount: Number(t.amount),
      count: t.count,
      byMode: {
        cash: Number(t.by_mode.cash),
        bank_transfer: Number(t.by_mode.bank_transfer),
        upi: Number(t.by_mode.upi),
        cheque: Number(t.by_mode.cheque),
        other: Number(t.by_mode.other),
      },
    },
  };
}

/**
 * Government rent paid to the owner's bank directly (A11) for the rent months
 * the days touch, up to this month: computed, never recorded, so the table's
 * search and filters don't apply to it.
 */
export async function getPaymentsPaidDirect(_ctx: OwnerContext, query: unknown = {}): Promise<PaymentsPaidDirect> {
  const range = resolveDayRange(parseInput(paymentsQuerySchema, query ?? {}), PAYMENTS_LIMITS.maxDays);
  const [tenants, placement] = await Promise.all([tenantsList(), placements()]);
  const latest = currentMonthKey();
  const months = paidDirectPeriods(tenants, placement.ratesByTenant, monthsIn(monthsOfDayRange(range))).filter(
    (p) => p.period_month <= latest
  );
  return {
    amount: round2(months.reduce((sum, p) => sum + Number(p.amount_allocated), 0)),
    months: months.length,
    tenants: new Set(months.map((p) => p.tenant_id)).size,
  };
}

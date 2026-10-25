import "server-only";
import type { BillingPayment, BillingReport, BillingRow } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { billingTotals, isPaidDirect, monthsIn, resolveRange } from "@/lib/domain/billing";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import { BILLING_LIMITS, billingQuerySchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import { parseInput, type OwnerContext } from "./context";
import { billedTenantIds, ensureRentPeriodsFor, paidDirectPeriods, paidDirectTenants } from "./periods";
import { loadPlacements, placementOf } from "./placements";

/**
 * Rent billed per tenant per month over a range of months (default: this
 * month, the latest one that has fallen due), what was paid towards each
 * month and by which receipts, plus the cash received in those months.
 */
export async function getBillingReport(_ctx: OwnerContext, query: unknown = {}): Promise<BillingReport> {
  const input = parseInput(billingQuerySchema, query ?? {});
  const latestMonth = currentMonthKey();
  const range = resolveRange(input, latestMonth, BILLING_LIMITS.maxMonths);

  const db = await ownerDb();
  const allTenants = await db.tenants.list();
  await ensureRentPeriodsFor(billedTenantIds(allTenants));

  const tenantIds = allTenants.map((t) => t.id);
  const stored = await db.rentPeriods.listForTenants(tenantIds, { months: range });
  const directTenants = paidDirectTenants(allTenants);
  const shownTenants = [...new Set([...stored.map((p) => p.tenant_id), ...directTenants.map((t) => t.id)])];
  const [allocations, payments, placements] = await Promise.all([
    db.payments.listAllocationsForPeriods(stored.map((p) => p.id)),
    db.payments.listForTenants(tenantIds, { status: "confirmed", fromDate: range.from }),
    loadPlacements(db, shownTenants),
  ]);
  // Government rent paid to the owner directly: billed and collected each month (A11).
  const showPaidDirect = input.paidDirect === "show";
  const direct = showPaidDirect ? paidDirectPeriods(allTenants, placements.ratesByTenant, monthsIn(range)) : [];
  const periods = [...stored, ...direct];

  // Payments made before the range can still have paid for its months (in
  // advance); fetch just those, by id.
  const known = new Map(payments.map((p) => [p.id, p]));
  const earlier = [...new Set(allocations.map((a) => a.payment_id))].filter((id) => !known.has(id));
  for (const id of earlier) {
    const payment = await db.payments.get(id);
    if (payment) known.set(id, payment);
  }

  const paymentsByPeriod = new Map<string, BillingPayment[]>();
  for (const a of allocations) {
    const payment = known.get(a.payment_id);
    if (!payment || payment.status !== "confirmed") continue;
    const list = paymentsByPeriod.get(a.rent_period_id) ?? [];
    list.push({
      paymentId: payment.id,
      receiptNo: payment.receipt_no,
      paymentDate: payment.payment_date,
      mode: payment.mode,
      amount: Number(a.amount_allocated),
    });
    paymentsByPeriod.set(a.rent_period_id, list);
  }

  const tenantsById = new Map(allTenants.map((t) => [t.id, t]));
  const rows: BillingRow[] = periods.map((p) => {
    const tenant = tenantsById.get(p.tenant_id);
    const placement = placementOf(placements, p.tenant_id);
    const amountDue = Number(p.amount_due);
    const amountAllocated = Number(p.amount_allocated);
    return {
      id: p.id,
      tenantId: p.tenant_id,
      tenantName: tenant ? tenantDisplayName(tenant) : "—",
      propertyName: placement.propertyName,
      unitCodes: placement.unitCodes,
      periodMonth: p.period_month,
      monthLabel: formatMonth(p.period_month),
      amountDue,
      amountAllocated,
      balance: round2(Math.max(0, amountDue - amountAllocated)),
      status: p.status,
      notYetDue: p.period_month >= latestMonth,
      payments: (paymentsByPeriod.get(p.id) ?? []).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)),
      paidDirect: isPaidDirect(p.id),
    };
  });

  // Cash view: money that arrived in the range's calendar months.
  const afterRange = addMonthsToKey(range.to, 1);
  const inRange = payments.filter((p) => monthKeyOf(p.payment_date) < afterRange);
  const paidDirect = round2(
    direct.filter((p) => p.period_month <= latestMonth).reduce((sum, p) => sum + Number(p.amount_allocated), 0)
  );
  const recorded = inRange.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    from: range.from,
    to: range.to,
    latestMonth,
    rows,
    totals: billingTotals(rows),
    received: { amount: round2(recorded + paidDirect), payments: inRange.length, paidDirect },
    paidDirect: { available: directTenants.length > 0, shown: showPaidDirect },
  };
}

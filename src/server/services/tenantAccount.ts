import "server-only";
import type * as z from "zod";
import type { TenantAccount, TenantDetail, TenantLedgerView, TenantMonthsPage } from "@/lib/contracts";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { Tenant } from "@/lib/types";
import type { tenantLedgerQuerySchema, tenantMonthsQuerySchema } from "@/lib/validation";
import type { TenantAccountReads } from "@/server/ports";
import { placementOf, type Placements } from "./placements";

// A tenant's account as the tenant page shows it - profile, balance, rent
// months, ledger - built once from TenantAccountReads, which both the owner's
// repositories (the owner's tenant page, ./tenants.ts) and a signed-in
// tenant's own (the portal, ./tenantPortal.ts, A32) provide. Callers check
// who may read `tenantId` and top up its rent months first.

/** Who they are, their houses and rents - no money (that's account and ledger). */
export function tenantDetailOf(tenant: Tenant, placements: Placements): TenantDetail {
  const placement = placementOf(placements, tenant.id);
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      businessName: tenant.business_name,
      displayName: tenantDisplayName(tenant),
      phone: tenant.phone,
      preferredChannel: tenant.preferred_channel,
      status: tenant.status,
      tenantKind: tenant.tenant_kind,
      rentTracked: tenant.rent_tracked,
      leaseStart: tenant.lease_start,
      billingStart: tenant.billing_start,
      depositAmount: tenant.deposit_amount === null ? null : Number(tenant.deposit_amount),
      movedOutOn: tenant.moved_out_on,
      monthlyRent: placement.monthlyRent,
      unitMix: placement.unitMix,
      currentUnits: placement.houses,
      unitHistory: (placements.historyByTenant.get(tenant.id) ?? []).map((o) => ({
        unitCode: o.unit_code,
        label: placements.unitsByCode.get(o.unit_code)?.label ?? null,
        startDate: o.start_date,
        endDate: o.end_date,
      })),
      rentHistory: (placements.ratesByTenant.get(tenant.id) ?? []).map((r) => ({
        effectiveMonth: r.effective_month,
        monthlyAmount: Number(r.monthly_amount),
      })),
    },
  };
}

/** The balance figures, aggregated in one query (D29). */
export async function tenantAccountOf(reads: TenantAccountReads, tenantId: string): Promise<TenantAccount> {
  const s = await reads.tenants.accountSummary(tenantId);
  return {
    balance: {
      totalOutstanding: round2(Number(s.total_outstanding)),
      overdueMonths: s.overdue_months,
      notYetDue: round2(Number(s.not_yet_due)),
    },
    endedMonths: s.ended_months,
    paidEndedMonths: s.paid_ended_months,
    canStopRentTracking: s.can_stop_rent_tracking,
  };
}

// The Months table's fields → the columns the Months query reads.
const MONTH_SORT_COLUMNS = {
  periodMonth: "period_month",
  amountDue: "amount_due",
  amountAllocated: "amount_allocated",
  status: "status",
} as const;
const MONTH_FILTER_COLUMNS = { periodMonth: "month", status: "status" } as const;

/** One page of the rent months, paged, sorted and searched in SQL (A15). `q` is already validated. */
export async function tenantMonthsOf(
  reads: TenantAccountReads,
  tenantId: string,
  q: z.infer<typeof tenantMonthsQuerySchema>
): Promise<TenantMonthsPage> {
  const result = await reads.rentPeriods.page({
    tenantId,
    show: q.show,
    search: q.q || undefined,
    filters: q.filters.map((f) => ({ ...f, field: MONTH_FILTER_COLUMNS[f.field] })),
    logic: q.logic,
    sort: MONTH_SORT_COLUMNS[q.sort],
    dir: q.dir,
    page: q.page,
    pageSize: q.pageSize,
  });
  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      periodMonth: r.period_month,
      amountDue: Number(r.amount_due),
      amountAllocated: Number(r.amount_allocated),
      status: r.status,
      displayStatus: r.display_status,
      monthLabel: r.month_label,
    })),
    total: result.total,
    all: result.all,
    page: result.page,
    totals: { amountDue: result.sums.amount_due, amountAllocated: result.sums.amount_allocated },
    notYetDue: result.sums.not_yet_due,
  };
}

// The Ledger table's fields → the columns the ledger query reads (the same names).
const LEDGER_FILTER_COLUMNS = { date: "date", description: "description", status: "status" } as const;

/** The ledger row's second line for the tenant (A32): what it is, never the owner's "not signed by tenant". */
function tenantCaption(r: { type: string; receipt_no: string | null }): string {
  if (r.type === "charge") return "Rent for the month";
  return r.receipt_no ? `Receipt ${r.receipt_no}` : r.type === "payment" ? "Payment" : "Correction";
}

/**
 * One page of the ledger (charges, payments, adjustments) with the all-time
 * running balance (A15), plus the proofs of that page's payments.
 * `tenantMessaging`: whether the page may offer to send a link (owner only).
 * `audience: "tenant"` (the portal, A32): the tenant's own caption and no
 * owner tags.
 */
export async function tenantLedgerOf(
  reads: TenantAccountReads,
  tenantId: string,
  q: z.infer<typeof tenantLedgerQuerySchema>,
  options: { tenantMessaging: boolean; audience?: "owner" | "tenant" }
): Promise<TenantLedgerView> {
  const forTenant = options.audience === "tenant";
  const result = await reads.ledger.page({
    tenantId,
    fromDate: q.from,
    toDate: q.to,
    creditsOnly: q.show === "credits",
    search: q.q || undefined,
    filters: q.filters.map((f) => ({ ...f, field: LEDGER_FILTER_COLUMNS[f.field] })),
    logic: q.logic,
    sort: q.sort,
    dir: q.dir,
    page: q.page,
    pageSize: q.pageSize,
  });
  const paymentIds = result.rows.filter((r) => r.type === "payment" && r.ref_id).map((r) => r.ref_id as string);
  const proofs = paymentIds.length > 0 ? await reads.payments.listProofs(paymentIds) : [];
  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      type: r.type,
      date: r.date,
      description: r.description,
      caption: forTenant ? tenantCaption(r) : r.caption,
      debit: Number(r.debit),
      credit: Number(r.credit),
      balance: Number(r.balance),
      status: r.status,
      refId: r.ref_id ?? undefined,
      receiptNo: r.receipt_no ?? undefined,
      proofs:
        r.type === "payment"
          ? proofs
              .filter((f) => f.payment_id === r.ref_id)
              .map((f) => ({ id: f.id, fileName: f.file_name, contentType: f.content_type }))
          : undefined,
      acknowledged: r.acknowledged ?? undefined,
      tags: r.type === "payment" && !forTenant ? r.tags : undefined,
    })),
    total: result.total,
    all: result.all,
    page: result.page,
    tenantMessaging: options.tenantMessaging,
    totals: { debit: result.sums.debit, credit: result.sums.credit },
    uncountedRows: result.sums.not_counted,
  };
}

import "server-only";
import * as z from "zod";
import type {
  AnyTowerTenantForm,
  BulkCreateResult,
  Created,
  EditTenantForm,
  TenantAccount,
  TenantDetail,
  TablePage,
  TenantLedgerView,
  TenantMonthRow,
  TenantSearchRow,
} from "@/lib/contracts";
import { currentMonthKey } from "@/lib/dates";
import { summarizeBalance } from "@/lib/domain/allocation";
import { round2 } from "@/lib/money";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { errorMessage } from "@/lib/errors";
import type { RentPeriod } from "@/lib/types";
import {
  correctPaidThroughSchema,
  createTenantSchema,
  moveOutSchema,
  startRentTrackingSchema,
  tenantLedgerQuerySchema,
  tenantMonthsQuerySchema,
  updateTenantSchema,
} from "@/lib/validation";
import { tenantMessagingEnabled } from "@/server/env";
import { ownerDb } from "@/server/infra";
import type { NewTenant } from "@/server/ports";
import { parseInput, requireTenant, type OwnerContext } from "./context";
import { billedTenantIds, ensureRentPeriodsFor } from "./periods";
import { db, tenantById, tenantPlacements } from "./loaders";
import { listTenantDocuments } from "./tenantDocuments";
import { availableUnits, loadPlacements, placementOf } from "./placements";

const MAX_BULK_ROWS = 500;

function toNewTenant(input: z.infer<typeof createTenantSchema>): NewTenant {
  return {
    name: input.name,
    business_name: input.businessName || null,
    phone: input.phone ?? null,
    preferred_channel: input.preferredChannel,
    monthly_rent: input.monthlyRentAmount ?? null,
    lease_start: input.leaseStart,
    unit_codes: input.unitCodes,
    paid_through: input.paidThrough ?? null,
    deposit_amount: input.depositAmount ?? null,
    tenant_kind: input.tenantKind,
    rent_tracked: input.rentTracked,
  };
}

/** Every tenant, current and former - former ones mostly matter while they still owe. */
export async function listTenants(_ctx: OwnerContext): Promise<TenantSearchRow[]> {
  const db = await ownerDb();
  const [tenants, locations] = await Promise.all([db.tenants.list(), db.locations.list()]);
  const tenantIds = tenants.map((t) => t.id);
  await ensureRentPeriodsFor(billedTenantIds(tenants));
  const [periods, placements] = await Promise.all([
    // Balances only need what's still owed.
    db.rentPeriods.listForTenants(tenantIds, { openOnly: true }),
    loadPlacements(db, tenantIds),
  ]);

  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    periodsByTenant.set(period.tenant_id, [...(periodsByTenant.get(period.tenant_id) ?? []), period]);
  }
  const locationName = new Map(locations.map((l) => [l.location_code, l.name]));

  const todayMonthKey = currentMonthKey();
  return tenants.map((tenant) => {
    const placement = placementOf(placements, tenant.id);
    const balance = summarizeBalance(periodsByTenant.get(tenant.id) ?? [], todayMonthKey);
    const locationCodes = [...new Set(placement.houses.map((h) => h.propertyCode.split("-")[0]))];
    return {
      tenantId: tenant.id,
      displayName: tenantDisplayName(tenant),
      contactName: tenant.business_name ? tenant.name : null,
      businessName: tenant.business_name,
      unitMix: placement.unitMix,
      unitCodes: placement.unitCodes,
      monthlyRent: placement.monthlyRent,
      phone: tenant.phone,
      propertyName: placement.propertyName,
      locationName: locationCodes.map((c) => locationName.get(c) ?? c).join(", "),
      status: tenant.status,
      tenantKind: tenant.tenant_kind,
      rentTracked: tenant.rent_tracked,
      movedOutOn: tenant.moved_out_on,
      totalOutstanding: balance.totalOutstanding,
      overdueMonths: balance.overdueMonths,
    };
  });
}

/** The tenant page's profile: who they are, their houses and rents - no money (that's account and ledger). */
export async function getTenantDetail(_ctx: OwnerContext, tenantId: string): Promise<TenantDetail> {
  const [tenant, placements] = await Promise.all([tenantById(tenantId), tenantPlacements(tenantId)]);
  const placement = placementOf(placements, tenantId);
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
      unitHistory: (placements.historyByTenant.get(tenantId) ?? []).map((o) => ({
        unitCode: o.unit_code,
        startDate: o.start_date,
        endDate: o.end_date,
      })),
      rentHistory: (placements.ratesByTenant.get(tenantId) ?? []).map((r) => ({
        effectiveMonth: r.effective_month,
        monthlyAmount: Number(r.monthly_amount),
      })),
    },
  };
}

/**
 * What the tenant owes: the balance, how many ended months are paid and
 * whether tracking can stop - aggregated in SQL (tenant_account_summary,
 * D29), never by loading every month, payment and adjustment.
 */
export async function getTenantAccount(_ctx: OwnerContext, tenantId: string): Promise<TenantAccount> {
  const tenant = await tenantById(tenantId);
  // Months billed ahead must exist before they're counted as not due yet.
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  const s = await (await db()).tenants.accountSummary(tenantId);
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

// The Months table's fields → the columns tenant_months_page reads.
const MONTH_SORT_COLUMNS = {
  periodMonth: "period_month",
  amountDue: "amount_due",
  amountAllocated: "amount_allocated",
  status: "status",
} as const;
const MONTH_FILTER_COLUMNS = { periodMonth: "month", status: "status" } as const;

/** One page of the tenant's rent months, paged, sorted and searched in SQL (A15). */
export async function getTenantMonths(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<TablePage<TenantMonthRow>> {
  const tenant = await tenantById(tenantId);
  const q = parseInput(tenantMonthsQuerySchema, query);
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  const result = await (await db()).rentPeriods.page({
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
  };
}

// The Ledger table's fields → the columns tenant_ledger_page reads (the same names).
const LEDGER_FILTER_COLUMNS = { date: "date", description: "description", status: "status" } as const;

/**
 * One page of the tenant's ledger (charges, payments, adjustments), paged,
 * sorted and searched in SQL with the all-time running balance (A15), plus
 * the proofs of that page's payments.
 */
export async function getTenantLedger(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<TenantLedgerView> {
  const tenant = await tenantById(tenantId);
  const q = parseInput(tenantLedgerQuerySchema, query);
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  const repos = await db();
  const result = await repos.ledger.page({
    tenantId,
    fromDate: q.from,
    toDate: q.to,
    search: q.q || undefined,
    filters: q.filters.map((f) => ({ ...f, field: LEDGER_FILTER_COLUMNS[f.field] })),
    logic: q.logic,
    sort: q.sort,
    dir: q.dir,
    page: q.page,
    pageSize: q.pageSize,
  });
  const paymentIds = result.rows.filter((r) => r.type === "payment" && r.ref_id).map((r) => r.ref_id as string);
  const proofs = paymentIds.length > 0 ? await repos.payments.listProofs(paymentIds) : [];
  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      type: r.type,
      date: r.date,
      description: r.description,
      caption: r.caption,
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
    })),
    total: result.total,
    all: result.all,
    page: result.page,
    tenantMessaging: tenantMessagingEnabled(),
  };
}

/** Vacant houses in every tower, for "Add tenant" without starting from a tower. */
export async function getAnyTowerTenantForm(_ctx: OwnerContext): Promise<AnyTowerTenantForm> {
  const db = await ownerDb();
  return { availableUnits: await availableUnits(db) };
}

/** Onboards a tenant onto one or more vacant houses at one combined rent. */
export async function createTenant(ctx: OwnerContext, body: unknown): Promise<Created> {
  const input = parseInput(createTenantSchema, body);
  const db = await ownerDb();
  const created = await db.tenants.create(toNewTenant(input));
  await ensureRentPeriodsFor([created.id]);
  return created;
}

export async function bulkCreateTenants(ctx: OwnerContext, rows: unknown): Promise<BulkCreateResult> {
  const tenants = parseInput(
    z.array(z.unknown()).min(1, "No tenants provided").max(MAX_BULK_ROWS, `Too many rows (max ${MAX_BULK_ROWS})`),
    rows
  );
  const db = await ownerDb();

  let created = 0;
  const createdIds: string[] = [];
  const failed: BulkCreateResult["failed"] = [];

  // Small-scale by design (a landlord's initial load, not a data pipeline) -
  // a plain loop keeps per-row error attribution simple, and each row is its
  // own transaction (a house taken by an earlier row fails just that row).
  for (let i = 0; i < tenants.length; i++) {
    const parsed = createTenantSchema.safeParse(tenants[i]);
    if (!parsed.success) {
      failed.push({ rowNumber: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }
    try {
      const { id } = await db.tenants.create(toNewTenant(parsed.data));
      createdIds.push(id);
      created += 1;
    } catch (err) {
      failed.push({ rowNumber: i + 1, error: errorMessage(err, "Could not save") });
    }
  }

  await ensureRentPeriodsFor(createdIds);
  return { created, failed };
}

export async function getEditTenantForm(ctx: OwnerContext, tenantId: string): Promise<EditTenantForm> {
  const db = await ownerDb();
  const tenant = await requireTenant(db, tenantId);
  const [placements, available, documents] = await Promise.all([
    loadPlacements(db, [tenantId]),
    availableUnits(db, tenantId),
    listTenantDocuments(db, tenantId),
  ]);
  const placement = placementOf(placements, tenantId);
  // A moved-out tenant's last houses may already be let again; a draft keeps its houses.
  const own = new Set(tenant.status !== "inactive" ? placement.unitCodes : []);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      businessName: tenant.business_name,
      phone: tenant.phone,
      preferredChannel: tenant.preferred_channel,
      status: tenant.status,
      tenantKind: tenant.tenant_kind,
      rentTracked: tenant.rent_tracked,
      leaseStart: tenant.lease_start,
      billingStart: tenant.billing_start,
      depositAmount: tenant.deposit_amount === null ? null : Number(tenant.deposit_amount),
      monthlyRent: placement.monthlyRent,
      unitCodes: [...own],
    },
    availableUnits: [...available.filter((u) => own.has(u.unitCode)), ...available.filter((u) => !own.has(u.unitCode))],
    documents,
  };
}

/**
 * Saves the tenant's full new state. The database diffs it: houses added or
 * removed change on `unitsEffective`, a new rent applies from
 * `rentEffectiveMonth`, and already-paid months are never re-priced.
 */
export async function updateTenant(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const input = parseInput(updateTenantSchema, body);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.update(tenantId, {
    name: input.name,
    business_name: input.businessName || null,
    phone: input.phone ?? null,
    preferred_channel: input.preferredChannel,
    unit_codes: input.unitCodes,
    units_effective: input.unitsEffective ?? null,
    monthly_rent: input.monthlyRentAmount ?? null,
    rent_effective_month: input.rentEffectiveMonth ?? null,
    lease_start: input.leaseStart ?? null,
    paid_through: input.paidThrough ?? null,
    deposit_amount: input.depositAmount ?? null,
    tenant_kind: input.tenantKind ?? null,
    rent_tracked: input.rentTracked ?? null,
  });
  await ensureRentPeriodsFor([tenantId]);
}

/** Fixes "rent paid up to" on an active tenant; see correct_paid_through (0014). */
export async function correctPaidThrough(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const { paidThrough } = parseInput(correctPaidThroughSchema, body);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.correctPaidThrough(tenantId, paidThrough);
}

/**
 * Starts billing a government tenant whose rent was paid to the owner
 * directly (0016): months from the one after "paid up to" appear at once,
 * unpaid ended ones as overdue.
 */
export async function startRentTracking(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const { monthlyRentAmount, paidThrough } = parseInput(startRentTrackingSchema, body);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.startRentTracking(tenantId, monthlyRentAmount ?? null, paidThrough ?? null);
}

/** Undoes startRentTracking while nothing is recorded against the months (409 after). */
export async function stopRentTracking(ctx: OwnerContext, tenantId: string): Promise<void> {
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.stopRentTracking(tenantId);
}

/** Ends every tenancy on the move-out date; dues up to then stay on the ledger. */
export async function moveOutTenant(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const { moveOutDate } = parseInput(moveOutSchema, body);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.moveOut(tenantId, moveOutDate);
}

import "server-only";
import * as z from "zod";
import type {
  AnyTowerTenantForm,
  BulkCreateResult,
  Created,
  EditTenantForm,
  TenantAccount,
  TenantDetail,
  TenantLedgerView,
  TenantMonthsPage,
  TenantSearchRow,
} from "@/lib/contracts";
import { currentMonthKey } from "@/lib/dates";
import { summarizeBalance } from "@/lib/domain/allocation";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { errorMessage } from "@/lib/errors";
import type { RentPeriod } from "@/lib/types";
import {
  correctPaidThroughSchema,
  correctRentSchema,
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
import { tenantAccountOf, tenantDetailOf, tenantLedgerOf, tenantMonthsOf } from "./tenantAccount";
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
  return tenantDetailOf(tenant, placements);
}

/**
 * What the tenant owes: the balance, how many ended months are paid and
 * whether tracking can stop - aggregated in one query (D29), never by loading every month, payment and adjustment.
 */
export async function getTenantAccount(_ctx: OwnerContext, tenantId: string): Promise<TenantAccount> {
  const tenant = await tenantById(tenantId);
  // Months billed ahead must exist before they're counted as not due yet.
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  return tenantAccountOf(await db(), tenantId);
}

/** One page of the tenant's rent months, paged, sorted and searched in SQL (A15). */
export async function getTenantMonths(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<TenantMonthsPage> {
  const tenant = await tenantById(tenantId);
  const q = parseInput(tenantMonthsQuerySchema, query);
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  return tenantMonthsOf(await db(), tenantId, q);
}

/**
 * One page of the tenant's ledger (charges, payments, adjustments), paged,
 * sorted and searched in SQL with the all-time running balance (A15), plus
 * the proofs of that page's payments.
 */
export async function getTenantLedger(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<TenantLedgerView> {
  const tenant = await tenantById(tenantId);
  const q = parseInput(tenantLedgerQuerySchema, query);
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  return tenantLedgerOf(await db(), tenantId, q, { tenantMessaging: tenantMessagingEnabled() });
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

/** Fixes a rent entered wrongly (correct_rent, 0025); for a real rent change use updateTenant. */
export async function correctRent(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const { fromMonth, monthlyRent } = parseInput(correctRentSchema, body);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  await db.tenants.correctRent(tenantId, fromMonth, monthlyRent);
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

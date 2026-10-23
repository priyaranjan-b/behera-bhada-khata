import "server-only";
import * as z from "zod";
import type {
  BulkCreateResult,
  Created,
  EditTenantForm,
  TenantDetail,
  TenantSearchRow,
} from "@/lib/contracts";
import { currentMonthKey } from "@/lib/dates";
import { summarizeBalance } from "@/lib/domain/allocation";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { buildTenantLedger } from "@/lib/domain/tenantLedger";
import { errorMessage } from "@/lib/errors";
import type { RentPeriod } from "@/lib/types";
import { createTenantSchema, moveOutSchema, updateTenantSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import type { NewTenant } from "@/server/ports";
import { notFound, parseInput, type OwnerContext } from "./context";
import { ensureRentPeriodsFor } from "./periods";
import { listTenantDocuments } from "./tenantDocuments";
import { availableUnits, loadPlacements, placementOf } from "./placements";

const MAX_BULK_ROWS = 500;

function toNewTenant(input: z.infer<typeof createTenantSchema>): NewTenant {
  return {
    name: input.name,
    business_name: input.businessName || null,
    phone: input.phone,
    preferred_channel: input.preferredChannel,
    monthly_rent: input.monthlyRentAmount,
    lease_start: input.leaseStart,
    unit_codes: input.unitCodes,
    paid_through: input.paidThrough ?? null,
    deposit_amount: input.depositAmount ?? null,
  };
}

/** Every tenant, current and former - former ones mostly matter while they still owe. */
export async function listTenants(_ctx: OwnerContext): Promise<TenantSearchRow[]> {
  const db = await ownerDb();
  const [tenants, locations] = await Promise.all([db.tenants.list(), db.locations.list()]);
  const tenantIds = tenants.map((t) => t.id);
  await ensureRentPeriodsFor(tenants.filter((t) => t.status === "active").map((t) => t.id));
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
      phone: tenant.phone,
      propertyName: placement.propertyName,
      locationName: locationCodes.map((c) => locationName.get(c) ?? c).join(", "),
      status: tenant.status,
      movedOutOn: tenant.moved_out_on,
      totalOutstanding: balance.totalOutstanding,
      overdueMonths: balance.overdueMonths,
    };
  });
}

export async function getTenantDetail(ctx: OwnerContext, tenantId: string): Promise<TenantDetail> {
  const db = await ownerDb();
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");

  if (tenant.status === "active") await ensureRentPeriodsFor([tenantId]);
  const [periods, payments, adjustments, placements] = await Promise.all([
    db.rentPeriods.listForTenants([tenantId]),
    db.payments.listForTenants([tenantId]),
    db.adjustments.listForTenants([tenantId]),
    loadPlacements(db, [tenantId]),
  ]);
  const placement = placementOf(placements, tenantId);
  const proofs = await db.payments.listProofs(payments.map((p) => p.id));
  const proofsByPayment = new Map<string, typeof proofs>();
  for (const proof of proofs) proofsByPayment.set(proof.payment_id, [...(proofsByPayment.get(proof.payment_id) ?? []), proof]);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      businessName: tenant.business_name,
      displayName: tenantDisplayName(tenant),
      phone: tenant.phone,
      preferredChannel: tenant.preferred_channel,
      status: tenant.status,
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
    balance: summarizeBalance(periods, currentMonthKey()),
    periods: periods.map((p) => ({
      id: p.id,
      periodMonth: p.period_month,
      amountDue: Number(p.amount_due),
      amountAllocated: Number(p.amount_allocated),
      status: p.status,
    })),
    ledger: buildTenantLedger(
      periods,
      payments.map((p) => ({
        ...p,
        proofs: (proofsByPayment.get(p.id) ?? []).map((f) => ({
          id: f.id,
          fileName: f.file_name,
          contentType: f.content_type,
        })),
      })),
      adjustments,
      currentMonthKey()
    ),
  };
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
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");
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
  if (!(await db.tenants.get(tenantId))) notFound("Tenant");
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
  });
  await ensureRentPeriodsFor([tenantId]);
}

/** Ends every tenancy on the move-out date; dues up to then stay on the ledger. */
export async function moveOutTenant(ctx: OwnerContext, tenantId: string, body: unknown): Promise<void> {
  const { moveOutDate } = parseInput(moveOutSchema, body);
  const db = await ownerDb();
  if (!(await db.tenants.get(tenantId))) notFound("Tenant");
  await db.tenants.moveOut(tenantId, moveOutDate);
}

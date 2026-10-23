import "server-only";
import * as z from "zod";
import { summarizeBalance } from "@/lib/allocation";
import type { BulkCreateResult, Created, TenantDetail, TenantSearchRow } from "@/lib/contracts";
import { errorMessage } from "@/lib/errors";
import { formatUnitLabel, tenantDisplayName } from "@/lib/tenant";
import { buildTenantLedger } from "@/lib/tenantLedger";
import type { RentPeriod } from "@/lib/types";
import { createTenantSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import type { NewTenant } from "@/server/ports";
import { notFound, parseInput, withParams, type OwnerContext } from "./context";
import { currentMonthKey, ensureRentPeriods, ensureRentPeriodsFor } from "./periods";

const MAX_BULK_ROWS = 500;

function toNewTenant(input: z.infer<typeof createTenantSchema>): NewTenant {
  return {
    property_id: input.propertyId,
    name: input.name,
    business_name: input.businessName ?? null,
    unit_type: input.unitType,
    tower: input.tower ?? null,
    floor: input.floor ?? null,
    house_number: input.houseNumber ?? null,
    phone: input.phone,
    preferred_channel: input.preferredChannel,
    monthly_rent_amount: input.monthlyRentAmount,
    lease_start: input.leaseStart,
  };
}

export async function listTenants(ctx: OwnerContext): Promise<TenantSearchRow[]> {
  const db = await ownerDb(ctx.ownerId);
  const [properties, tenants] = await Promise.all([db.properties.list(), db.tenants.list({ status: "active" })]);
  const tenantIds = tenants.map((t) => t.id);
  await ensureRentPeriodsFor(tenantIds);
  const periods = await db.rentPeriods.listForTenants(tenantIds);

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const periodsByTenant = new Map<string, RentPeriod[]>();
  for (const period of periods) {
    const list = periodsByTenant.get(period.tenant_id) ?? [];
    list.push(period);
    periodsByTenant.set(period.tenant_id, list);
  }

  const todayMonthKey = currentMonthKey();
  return tenants.map((tenant) => {
    const property = propertyById.get(tenant.property_id);
    const balance = summarizeBalance(periodsByTenant.get(tenant.id) ?? [], todayMonthKey);
    return {
      tenantId: tenant.id,
      displayName: tenantDisplayName(tenant),
      contactName: tenant.business_name ? tenant.name : null,
      businessName: tenant.business_name,
      unitType: tenant.unit_type,
      unitLabel: formatUnitLabel(tenant),
      phone: tenant.phone,
      propertyName: property?.name ?? "Property",
      propertyAddress: property?.address ?? "",
      totalOutstanding: balance.totalOutstanding,
      overdueMonths: balance.overdueMonths,
    };
  });
}

export async function getTenantDetail(ctx: OwnerContext, tenantId: string): Promise<TenantDetail> {
  const db = await ownerDb(ctx.ownerId);
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");

  await ensureRentPeriods(tenantId);
  const [property, periods, payments, adjustments] = await Promise.all([
    db.properties.get(tenant.property_id),
    db.rentPeriods.listForTenants([tenantId]),
    db.payments.listForTenants([tenantId]),
    db.adjustments.listForTenants([tenantId]),
  ]);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      businessName: tenant.business_name,
      displayName: tenantDisplayName(tenant),
      unitType: tenant.unit_type,
      unitLabel: formatUnitLabel(tenant),
      phone: tenant.phone,
      monthlyRent: Number(tenant.monthly_rent_amount),
      propertyId: tenant.property_id,
      propertyName: property?.name ?? "Property",
    },
    balance: summarizeBalance(periods, currentMonthKey()),
    periods: periods.map((p) => ({
      id: p.id,
      periodMonth: p.period_month,
      amountDue: Number(p.amount_due),
      amountAllocated: Number(p.amount_allocated),
      status: p.status,
    })),
    ledger: buildTenantLedger(periods, payments, adjustments),
  };
}

export async function createTenant(ctx: OwnerContext, propertyId: string, body: unknown): Promise<Created> {
  const input = parseInput(createTenantSchema, withParams(body, { propertyId }));
  const db = await ownerDb(ctx.ownerId);
  return db.tenants.create(toNewTenant(input));
}

export async function bulkCreateTenants(
  ctx: OwnerContext,
  propertyId: string,
  rows: unknown
): Promise<BulkCreateResult> {
  const tenants = parseInput(
    z.array(z.unknown()).min(1, "No tenants provided").max(MAX_BULK_ROWS, `Too many rows (max ${MAX_BULK_ROWS})`),
    rows
  );
  const db = await ownerDb(ctx.ownerId);

  let created = 0;
  const failed: BulkCreateResult["failed"] = [];

  // Small-scale by design (a landlord's initial load, not a data pipeline) -
  // a plain loop keeps per-row error attribution simple and is plenty fast
  // at this volume.
  for (let i = 0; i < tenants.length; i++) {
    const parsed = createTenantSchema.safeParse(withParams(tenants[i], { propertyId }));
    if (!parsed.success) {
      failed.push({ rowNumber: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }
    try {
      await db.tenants.create(toNewTenant(parsed.data));
      created += 1;
    } catch (err) {
      failed.push({ rowNumber: i + 1, error: errorMessage(err, "Could not save") });
    }
  }

  return { created, failed };
}

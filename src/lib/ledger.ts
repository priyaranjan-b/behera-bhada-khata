import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/token";
import { format } from "date-fns";

export type RecordType = "payment" | "adjustment";

export interface PendingRecordContext {
  recordType: RecordType;
  record: {
    id: string;
    tenant_id: string;
    amount: number;
    date: string;
    mode?: string;
    note: string | null;
    reason?: string;
    owner_signature_path: string | null;
    status: string;
    token_expires_at: string;
  };
  tenant: { id: string; name: string; phone: string; property_id: string };
  property: { id: string; name: string };
  ownerName: string;
  lineItems: { label: string; amount: number; rentPeriodId: string }[];
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4) : phone;
}

async function periodMonthsByIds(rentPeriodIds: string[]): Promise<Map<string, string>> {
  if (rentPeriodIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.from("rent_periods").select("id, period_month").in("id", rentPeriodIds);
  return new Map((data ?? []).map((p) => [p.id, p.period_month]));
}

function formatPeriod(periodMonth: string | undefined): string {
  if (!periodMonth) return "unknown period";
  return format(new Date(`${periodMonth}T00:00:00Z`), "MMMM yyyy");
}

export async function loadPendingRecordByToken(
  token: string,
  recordType: RecordType
): Promise<PendingRecordContext | null> {
  const admin = createAdminClient();
  const tokenHash = hashToken(token);

  if (recordType === "payment") {
    const { data: payment } = await admin
      .from("payments")
      .select(
        "id, tenant_id, amount, payment_date, mode, note, owner_signature_path, status, token_expires_at"
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!payment) return null;

    const { data: allocations } = await admin
      .from("payment_allocations")
      .select("amount_allocated, rent_period_id")
      .eq("payment_id", payment.id);

    const periodMonths = await periodMonthsByIds((allocations ?? []).map((a) => a.rent_period_id));
    const { tenant, property, ownerName } = await loadTenantContext(payment.tenant_id);
    if (!tenant) return null;

    return {
      recordType: "payment",
      record: {
        id: payment.id,
        tenant_id: payment.tenant_id,
        amount: Number(payment.amount),
        date: payment.payment_date,
        mode: payment.mode,
        note: payment.note,
        owner_signature_path: payment.owner_signature_path,
        status: payment.status,
        token_expires_at: payment.token_expires_at,
      },
      tenant,
      property,
      ownerName,
      lineItems: (allocations ?? []).map((a) => ({
        label: `Rent for ${formatPeriod(periodMonths.get(a.rent_period_id))}`,
        amount: Number(a.amount_allocated),
        rentPeriodId: a.rent_period_id,
      })),
    };
  }

  const { data: adjustment } = await admin
    .from("adjustments")
    .select(
      "id, tenant_id, delta_amount, reason, owner_signature_path, status, token_expires_at, created_at, original_payment_id"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!adjustment) return null;

  const { data: allocations } = await admin
    .from("adjustment_allocations")
    .select("amount_delta, rent_period_id")
    .eq("adjustment_id", adjustment.id);

  const periodMonths = await periodMonthsByIds((allocations ?? []).map((a) => a.rent_period_id));
  const { tenant, property, ownerName } = await loadTenantContext(adjustment.tenant_id);
  if (!tenant) return null;

  return {
    recordType: "adjustment",
    record: {
      id: adjustment.id,
      tenant_id: adjustment.tenant_id,
      amount: Number(adjustment.delta_amount),
      date: format(new Date(adjustment.created_at), "yyyy-MM-dd"),
      note: adjustment.reason,
      reason: adjustment.reason,
      owner_signature_path: adjustment.owner_signature_path,
      status: adjustment.status,
      token_expires_at: adjustment.token_expires_at,
    },
    tenant,
    property,
    ownerName,
    lineItems: (allocations ?? []).map((a) => ({
      label: `Adjustment for ${formatPeriod(periodMonths.get(a.rent_period_id))}`,
      amount: Number(a.amount_delta),
      rentPeriodId: a.rent_period_id,
    })),
  };
}

async function loadTenantContext(tenantId: string) {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, phone, property_id, owner_id")
    .eq("id", tenantId)
    .single();

  if (!tenant) return { tenant: null, property: null, ownerName: "Owner" };

  const { data: property } = await admin
    .from("properties")
    .select("id, name")
    .eq("id", tenant.property_id)
    .single();

  return {
    tenant: { id: tenant.id, name: tenant.name, phone: tenant.phone, property_id: tenant.property_id },
    property: property ?? { id: tenant.property_id, name: "Property" },
    ownerName: "Owner",
  };
}

async function applyDelta(rentPeriodId: string, delta: number): Promise<void> {
  const admin = createAdminClient();
  const { data: period } = await admin
    .from("rent_periods")
    .select("amount_allocated")
    .eq("id", rentPeriodId)
    .single();
  if (!period) return;

  const newAmount = Math.max(0, Number(period.amount_allocated) + delta);
  await admin.from("rent_periods").update({ amount_allocated: newAmount }).eq("id", rentPeriodId);
}

// Atomically flips a pending payment/adjustment to confirmed and applies its
// allocations to rent_periods. The `.eq("status", "pending")` on the record
// update acts as a compare-and-swap: if two confirm requests race, only the
// first affects any rows, and the second gets `updated: false`.
export async function confirmRecordAndApplyAllocations(params: {
  recordType: RecordType;
  recordId: string;
  tenantSignaturePath: string;
  pdfPath: string;
  otpVerifiedAt: string;
}): Promise<{ updated: boolean }> {
  const { recordType, recordId, tenantSignaturePath, pdfPath, otpVerifiedAt } = params;
  const admin = createAdminClient();

  const patch = {
    tenant_signature_path: tenantSignaturePath,
    pdf_path: pdfPath,
    otp_verified_at: otpVerifiedAt,
    confirmed_at: new Date().toISOString(),
    status: "confirmed" as const,
  };

  if (recordType === "payment") {
    const { data: updatedRows, error } = await admin
      .from("payments")
      .update(patch)
      .eq("id", recordId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(`Failed to confirm payment: ${error.message}`);
    if (!updatedRows || updatedRows.length === 0) return { updated: false };

    const { data: allocations } = await admin
      .from("payment_allocations")
      .select("rent_period_id, amount_allocated")
      .eq("payment_id", recordId);
    for (const allocation of allocations ?? []) {
      await applyDelta(allocation.rent_period_id, Number(allocation.amount_allocated));
    }
    return { updated: true };
  }

  const { data: updatedRows, error } = await admin
    .from("adjustments")
    .update(patch)
    .eq("id", recordId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`Failed to confirm adjustment: ${error.message}`);
  if (!updatedRows || updatedRows.length === 0) return { updated: false };

  const { data: allocations } = await admin
    .from("adjustment_allocations")
    .select("rent_period_id, amount_delta")
    .eq("adjustment_id", recordId);
  for (const allocation of allocations ?? []) {
    await applyDelta(allocation.rent_period_id, Number(allocation.amount_delta));
  }
  return { updated: true };
}

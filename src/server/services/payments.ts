import "server-only";
import * as z from "zod";
import type { AdjustPaymentForm, Created, NewPaymentForm, ResendInput } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { tenantDisplayName } from "@/lib/tenant";
import { createPaymentSchema } from "@/lib/validation";
import { ownerDb, storage } from "@/server/infra";
import { notFound, parseInput, withParams, type OwnerContext } from "./context";
import { confirmUrl, generateConfirmToken, notifyTenant, storeOwnerSignature } from "./confirmLinks";
import { ensureRentPeriods } from "./periods";

export const resendSchema = z.object({ tenantId: z.string().min(1), amount: z.number() });

export async function getNewPaymentForm(ctx: OwnerContext, tenantId: string): Promise<NewPaymentForm> {
  const db = await ownerDb(ctx.ownerId);
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");

  await ensureRentPeriods(tenantId);
  const periods = await db.rentPeriods.listForTenants([tenantId]);

  return {
    tenantId,
    tenantName: tenantDisplayName(tenant),
    openPeriods: periods
      .filter((p) => Number(p.amount_due) > Number(p.amount_allocated))
      .map((p) => ({
        id: p.id,
        period_month: p.period_month,
        amount_due: p.amount_due,
        amount_allocated: p.amount_allocated,
      })),
  };
}

export async function createPayment(ctx: OwnerContext, tenantId: string, body: unknown): Promise<Created> {
  const input = parseInput(createPaymentSchema, withParams(body, { tenantId }));
  const db = await ownerDb(ctx.ownerId);
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");

  const { id, ownerSignaturePath } = await storeOwnerSignature("payments", tenant, input.ownerSignaturePng);
  const { token, tokenHash, expiresAt } = generateConfirmToken();

  await db.payments.create(
    {
      id,
      tenant_id: tenantId,
      amount: input.amount,
      payment_date: input.paymentDate,
      mode: input.mode,
      note: input.note ?? null,
      owner_signature_path: ownerSignaturePath,
      token_hash: tokenHash,
      token_expires_at: expiresAt,
    },
    input.allocations.map((a) => ({ rent_period_id: a.rentPeriodId, amount_allocated: a.amountAllocated }))
  );

  await notifyTenant(
    tenant,
    `Hi ${tenant.name}, a rent payment of ${formatMoney(input.amount)} was recorded. Please confirm here: ${confirmUrl(token)}`
  );
  return { id };
}

export async function getAdjustPaymentForm(ctx: OwnerContext, paymentId: string): Promise<AdjustPaymentForm> {
  const db = await ownerDb(ctx.ownerId);
  const payment = await db.payments.get(paymentId);
  // Only a confirmed payment can be corrected; a pending one is still awaiting the tenant.
  if (!payment || payment.status !== "confirmed") notFound("Payment");

  const [tenant, allocations] = await Promise.all([
    db.tenants.get(payment.tenant_id),
    db.payments.listAllocations(paymentId),
  ]);
  const rentPeriods = await db.rentPeriods.listByIds(allocations.map((a) => a.rent_period_id));
  const periodMonthById = new Map(rentPeriods.map((p) => [p.id, p.period_month]));

  return {
    paymentId,
    tenantId: payment.tenant_id,
    tenantName: tenant ? tenantDisplayName(tenant) : null,
    amount: Number(payment.amount),
    paymentDate: payment.payment_date,
    periods: allocations.map((a) => ({
      rentPeriodId: a.rent_period_id,
      periodMonth: periodMonthById.get(a.rent_period_id) ?? "",
      originallyAllocated: Number(a.amount_allocated),
    })),
  };
}

// Rotates the share link for a pending payment and resends it. The owner's
// UPDATE grant covers only the token columns (0001_init.sql), so this can
// never touch the ledger's financial facts.
export async function resendPaymentLink(ctx: OwnerContext, paymentId: string, body: unknown): Promise<void> {
  const input: ResendInput = parseInput(resendSchema, body);
  const db = await ownerDb(ctx.ownerId);
  const tenant = await db.tenants.get(input.tenantId);
  if (!tenant) throw new ApiError(400, "Tenant not found");

  const { token, tokenHash, expiresAt } = generateConfirmToken();
  await db.payments.rotateToken(paymentId, tokenHash, expiresAt);
  await notifyTenant(
    tenant,
    `Hi ${tenant.name}, reminder to confirm the rent payment of ${formatMoney(input.amount)}: ${confirmUrl(token)}`
  );
}

/** Short-lived download URL for a confirmed payment's signed receipt. */
export async function paymentReceiptUrl(ctx: OwnerContext, paymentId: string): Promise<string> {
  const db = await ownerDb(ctx.ownerId);
  const payment = await db.payments.get(paymentId);
  if (!payment?.pdf_path) throw new ApiError(404, "Not available");
  return storage.signedUrl(payment.pdf_path, 300);
}

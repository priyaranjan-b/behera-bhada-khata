import "server-only";
import type { CreatedAdjustment, ResendInput } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { createAdjustmentSchema } from "@/lib/validation";
import { ownerDb, storage } from "@/server/infra";
import { notFound, parseInput, withParams, type OwnerContext } from "./context";
import { confirmUrl, generateConfirmToken, notifyTenant, storeOwnerSignature } from "./confirmLinks";
import { resendSchema } from "./payments";

// A mistake on a confirmed payment is never edited in place - it's corrected
// with a new adjustment that goes through the same sign + OTP flow.
export async function createAdjustment(
  ctx: OwnerContext,
  paymentId: string,
  body: unknown
): Promise<CreatedAdjustment> {
  const input = parseInput(createAdjustmentSchema, withParams(body, { originalPaymentId: paymentId }));
  const db = await ownerDb(ctx.ownerId);

  const payment = await db.payments.get(paymentId);
  if (!payment || payment.status !== "confirmed") notFound("Payment");
  const tenant = await db.tenants.get(payment.tenant_id);
  if (!tenant) notFound("Tenant");

  const { id, ownerSignaturePath } = await storeOwnerSignature("adjustments", tenant, input.ownerSignaturePng);
  const { token, tokenHash, expiresAt } = generateConfirmToken();

  await db.adjustments.create(
    {
      id,
      tenant_id: tenant.id,
      original_payment_id: paymentId,
      delta_amount: input.deltaAmount,
      reason: input.reason,
      owner_signature_path: ownerSignaturePath,
      token_hash: tokenHash,
      token_expires_at: expiresAt,
    },
    input.allocations.map((a) => ({ rent_period_id: a.rentPeriodId, amount_delta: a.amountDelta }))
  );

  await notifyTenant(
    tenant,
    `Hi ${tenant.name}, a correction of ${formatMoney(input.deltaAmount)} was recorded on a past payment. Please confirm: ${confirmUrl(token)}`
  );
  return { id, tenantId: tenant.id };
}

export async function resendAdjustmentLink(ctx: OwnerContext, adjustmentId: string, body: unknown): Promise<void> {
  const input: ResendInput = parseInput(resendSchema, body);
  const db = await ownerDb(ctx.ownerId);
  const tenant = await db.tenants.get(input.tenantId);
  if (!tenant) throw new ApiError(400, "Tenant not found");

  const { token, tokenHash, expiresAt } = generateConfirmToken();
  await db.adjustments.rotateToken(adjustmentId, tokenHash, expiresAt);
  await notifyTenant(
    tenant,
    `Hi ${tenant.name}, reminder to confirm the adjustment of ${formatMoney(input.amount)}: ${confirmUrl(token)}`
  );
}

export async function adjustmentReceiptUrl(ctx: OwnerContext, adjustmentId: string): Promise<string> {
  const db = await ownerDb(ctx.ownerId);
  const adjustment = await db.adjustments.get(adjustmentId);
  if (!adjustment?.pdf_path) throw new ApiError(404, "Not available");
  return storage.signedUrl(adjustment.pdf_path, 300);
}

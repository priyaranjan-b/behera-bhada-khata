import "server-only";
import type { CreatedAdjustment, LinkResent } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { createAdjustmentSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import { notFound, parseInput, requireId, requireTenant, withParams, type OwnerContext } from "./context";
import { confirmUrl, generateConfirmToken, notifyTenant, storeOwnerSignature, withUploadedFile } from "./confirmLinks";
import { ownerSignatureBytes } from "./profile";
import { describeRecord, ownerReceiptReads, receiptFile } from "./receipts";

// A mistake on a payment is never edited in place - it's corrected with a new
// adjustment, which (like a payment, since 0010) counts as soon as it's
// recorded; the tenant may acknowledge it with a signature + OTP.
export async function createAdjustment(
  ctx: OwnerContext,
  paymentId: string,
  body: unknown
): Promise<CreatedAdjustment> {
  const input = parseInput(createAdjustmentSchema, withParams(body, { originalPaymentId: paymentId }));
  const db = await ownerDb();

  const payment = await db.payments.get(paymentId);
  if (!payment || payment.status !== "confirmed") notFound("Payment");
  const tenant = await requireTenant(db, payment.tenant_id);

  const signature = await ownerSignatureBytes(db, input.ownerSignaturePng);
  const { id, ownerSignaturePath } = await storeOwnerSignature("adjustments", tenant, signature);
  const { token, tokenHash, expiresAt } = generateConfirmToken();

  // The database checks the allocations against the original payment,
  // inserts everything and applies it to the months in one transaction.
  await withUploadedFile(ownerSignaturePath, () =>
    db.adjustments.create(
      {
        id,
        original_payment_id: paymentId,
        delta_amount: input.deltaAmount,
        reason: input.reason,
        owner_signature_path: ownerSignaturePath,
        token_hash: tokenHash,
        token_expires_at: expiresAt,
      },
      input.allocations.map((a) => ({ rent_period_id: a.rentPeriodId, amount: a.amountDelta }))
    )
  );

  const notified =
    input.notifyTenant === false
      ? null
      : await notifyTenant(
          tenant,
          `Hi ${tenant.name}, a correction of ${formatMoney(input.deltaAmount)} was recorded on a past rent payment. View and acknowledge it: ${confirmUrl(token)}`
        );
  return { id, tenantId: tenant.id, notified };
}

/** Like resendPaymentLink: tenant and amount come from the adjustment itself. */
export async function resendAdjustmentLink(ctx: OwnerContext, adjustmentId: string): Promise<LinkResent> {
  requireId(adjustmentId, "Adjustment");
  const db = await ownerDb();
  const adjustment = await db.adjustments.get(adjustmentId);
  if (!adjustment) notFound("Adjustment");
  if (adjustment.acknowledged_at) throw new ApiError(409, "The tenant has already acknowledged this adjustment");
  const tenant = await requireTenant(db, adjustment.tenant_id);

  const { token, tokenHash, expiresAt } = generateConfirmToken();
  if (!(await db.adjustments.rotateToken(adjustmentId, tokenHash, expiresAt))) {
    throw new ApiError(409, "The tenant has already acknowledged this adjustment");
  }
  const notified = await notifyTenant(
    tenant,
    `Hi ${tenant.name}, a correction of ${formatMoney(adjustment.delta_amount)} was recorded on your rent. View and acknowledge it: ${confirmUrl(token)}`
  );
  return { notified };
}

/** The adjustment's PDF, available from the moment it's recorded (see paymentReceipt). */
export async function adjustmentReceipt(
  ctx: OwnerContext,
  adjustmentId: string
): Promise<{ bytes: Uint8Array; fileName: string }> {
  requireId(adjustmentId, "Adjustment");
  const db = await ownerDb();
  const adjustment = await db.adjustments.get(adjustmentId);
  if (!adjustment) notFound("Adjustment");
  const details = await describeRecord(ownerReceiptReads(db), {
    recordType: "adjustment",
    row: adjustment,
    allocations: await db.adjustments.listAllocations(adjustmentId),
  });
  if (!details) notFound("Tenant");
  return receiptFile(details);
}

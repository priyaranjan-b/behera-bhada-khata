import "server-only";
import type { AdjustPaymentForm, LinkResent, NewPaymentForm, RecordCreated } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { createPaymentSchema } from "@/lib/validation";
import { ownerDb, storage } from "@/server/infra";
import {
  notFound,
  parseInput,
  requireId,
  requireTenant,
  SIGNED_URL_SECONDS,
  withParams,
  type OwnerContext,
  type UploadedFile,
} from "./context";
import {
  confirmUrl,
  generateConfirmToken,
  notifyTenant,
  recordFolder,
  storeOwnerSignature,
  withUploadedFile,
} from "./confirmLinks";
import { recordEvent } from "./audit";
import { checkProofFiles, storeProofs } from "./proofs";
import { ownerSignatureBytes, savedSignatureFor } from "./profile";
import { describeRecord, ownerReceiptReads, receiptFile } from "./receipts";
import { ensureRentPeriodsFor } from "./periods";
import { tenantMessagingEnabled } from "@/server/env";

export async function getNewPaymentForm(ctx: OwnerContext, tenantId: string): Promise<NewPaymentForm> {
  const db = await ownerDb();
  const tenant = await requireTenant(db, tenantId);

  await ensureRentPeriodsFor([tenantId]);
  const [periods, savedSignature] = await Promise.all([
    db.rentPeriods.listForTenants([tenantId], { openOnly: true }),
    savedSignatureFor(db, ctx),
  ]);

  return {
    tenantId,
    tenantName: tenantDisplayName(tenant),
    openPeriods: periods.map((p) => ({
      id: p.id,
      period_month: p.period_month,
      amount_due: p.amount_due,
      amount_allocated: p.amount_allocated,
    })),
    savedSignature,
    tenantMessaging: tenantMessagingEnabled(),
  };
}

/** `proofs`: optional photos/PDFs of the payment (a UPI screenshot, a cheque), stored with it. */
export async function createPayment(
  ctx: OwnerContext,
  tenantId: string,
  body: unknown,
  proofs: UploadedFile[] = []
): Promise<RecordCreated> {
  const input = parseInput(createPaymentSchema, withParams(body, { tenantId }));
  const proofFiles = checkProofFiles(proofs);
  const db = await ownerDb();
  const tenant = await requireTenant(db, tenantId);

  const signature = await ownerSignatureBytes(db, input.ownerSignaturePng);
  const { id, ownerSignaturePath } = await storeOwnerSignature("payments", tenant, signature);
  const proofRows = await withUploadedFile(ownerSignaturePath, () =>
    storeProofs(recordFolder("payments", tenant.id, id), proofFiles)
  );
  const { token, tokenHash, expiresAt } = generateConfirmToken();

  // The database checks the allocations (same tenant, sum = amount, within
  // what's owed) and the proof paths, inserts everything and applies it to
  // the months in one transaction: the payment counts from now (0010).
  await withUploadedFile([ownerSignaturePath, ...proofRows.map((p) => p.storage_path)], () =>
    db.payments.create(
      {
        id,
        tenant_id: tenantId,
        amount: input.amount,
        payment_date: input.paymentDate,
        mode: input.mode,
        note: input.note || null,
        owner_signature_path: ownerSignaturePath,
        token_hash: tokenHash,
        token_expires_at: expiresAt,
      },
      input.allocations.map((a) => ({ rent_period_id: a.rentPeriodId, amount: a.amountAllocated })),
      proofRows
    )
  );

  const notified =
    input.notifyTenant === false
      ? null
      : await notifyTenant(
          tenant,
          `Hi ${tenant.name}, we received your rent payment of ${formatMoney(input.amount)}. View and acknowledge the receipt: ${confirmUrl(token)}`,
          { db, recordType: "payment", recordId: id }
        );
  return { id, notified };
}

export async function getAdjustPaymentForm(ctx: OwnerContext, paymentId: string): Promise<AdjustPaymentForm> {
  requireId(paymentId, "Payment");
  const db = await ownerDb();
  const payment = await db.payments.get(paymentId);
  // Only a confirmed payment can be corrected; a pending one is still awaiting the tenant.
  if (!payment || payment.status !== "confirmed") notFound("Payment");

  const [tenant, allocations, savedSignature] = await Promise.all([
    db.tenants.get(payment.tenant_id),
    db.payments.listAllocations(paymentId),
    savedSignatureFor(db, ctx),
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
    savedSignature,
    tenantMessaging: tenantMessagingEnabled(),
  };
}

// Rotates the acknowledge link of a payment the tenant hasn't signed yet and
// (re)sends it to that payment's own tenant, quoting its recorded amount -
// nothing comes from the request body. The owner's UPDATE grant covers only
// the token columns (0001_init.sql), so this can never touch the ledger's
// financial facts.
export async function resendPaymentLink(ctx: OwnerContext, paymentId: string): Promise<LinkResent> {
  requireId(paymentId, "Payment");
  const db = await ownerDb();
  const payment = await db.payments.get(paymentId);
  if (!payment) notFound("Payment");
  if (payment.acknowledged_at) throw new ApiError(409, "The tenant has already acknowledged this payment");
  const tenant = await requireTenant(db, payment.tenant_id);

  const { token, tokenHash, expiresAt } = generateConfirmToken();
  if (!(await db.payments.rotateToken(paymentId, tokenHash, expiresAt))) {
    throw new ApiError(409, "The tenant has already acknowledged this payment");
  }
  const notified = await notifyTenant(
    tenant,
    `Hi ${tenant.name}, your rent payment of ${formatMoney(payment.amount)} is recorded. View and acknowledge the receipt: ${confirmUrl(token)}`,
    { db, recordType: "payment", recordId: paymentId, receiptNo: payment.receipt_no }
  );
  return { notified };
}

/** Short-lived URL for one of a payment's proof files (any status: proofs are attached when recording). */
export async function paymentProofUrl(ctx: OwnerContext, paymentId: string, proofId: string): Promise<string> {
  requireId(paymentId, "Payment");
  requireId(proofId, "Proof");
  const db = await ownerDb();
  const proof = await db.payments.getProof(proofId);
  if (!proof || proof.payment_id !== paymentId) notFound("Proof");
  return storage.signedUrl(proof.storage_path, SIGNED_URL_SECONDS);
}

/**
 * The payment's PDF receipt, available from the moment it's recorded: the
 * owner-signed copy, or the tenant-signed one once they've acknowledged.
 * For downloading and sending on (e.g. over WhatsApp).
 */
export async function paymentReceipt(ctx: OwnerContext, paymentId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  requireId(paymentId, "Payment");
  const db = await ownerDb();
  const payment = await db.payments.get(paymentId);
  if (!payment) notFound("Payment");
  const details = await describeRecord(ownerReceiptReads(db), {
    recordType: "payment",
    row: payment,
    allocations: await db.payments.listAllocations(paymentId),
  });
  if (!details) notFound("Tenant");
  const file = await receiptFile(details);
  await recordEvent(db, {
    action: "receipt.downloaded",
    tenantId: payment.tenant_id,
    entityType: "payment",
    entityId: paymentId,
    context: { receiptNo: payment.receipt_no },
  });
  return file;
}

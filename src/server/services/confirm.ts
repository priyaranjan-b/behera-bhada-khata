import "server-only";
import { randomUUID } from "node:crypto";
import type { ConfirmView, Confirmed, OtpSent, RecordType } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { confirmSchema, otpSendSchema } from "@/lib/validation";
import { messaging, storage, systemDb } from "@/server/infra";
import { hashToken } from "@/server/token";
import { pngDataUrlToBytes, recordFolder } from "./confirmLinks";
import { describeRecord, renderReceipt, systemReceiptReads, type RecordDetails } from "./receipts";
import { enforceRateLimits, HOUR, parseInput, withParams, type RequestMeta } from "./context";

// Tenant-facing and unauthenticated: possession of the unguessable token is
// the authorization, so everything here uses the unscoped system DB.
//
// Since 0010 a payment counts the moment the owner records it. The tenant's
// signature + OTP here is an optional acknowledgement: it produces the
// tenant-signed receipt and never moves money.

type Acknowledgeable = RecordDetails & { tenant: { phone: string } };

export function maskPhone(phone: string): string {
  return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4) : phone;
}

async function loadByToken(token: string, recordType: RecordType): Promise<Acknowledgeable | null> {
  const db = systemDb();
  const tokenHash = hashToken(token);
  const reads = systemReceiptReads(db);

  let details: RecordDetails | null;
  if (recordType === "payment") {
    const payment = await db.payments.findByTokenHash(tokenHash);
    if (!payment) return null;
    details = await describeRecord(reads, {
      recordType,
      row: payment,
      allocations: await db.payments.listAllocations(payment.id),
    });
  } else {
    const adjustment = await db.adjustments.findByTokenHash(tokenHash);
    if (!adjustment) return null;
    details = await describeRecord(reads, {
      recordType,
      row: adjustment,
      allocations: await db.adjustments.listAllocations(adjustment.id),
    });
  }
  // The link goes to the tenant's phone; without one there's nobody to verify.
  if (!details?.tenant.phone) return null;
  return details as Acknowledgeable;
}

function isExpired(ctx: RecordDetails): boolean {
  return !ctx.record.acknowledgedAt && new Date(ctx.record.tokenExpiresAt) < new Date();
}

/** Loads the record and rejects anything that can no longer be acknowledged. */
async function loadAcknowledgeable(token: string, recordType: RecordType): Promise<Acknowledgeable> {
  const ctx = await loadByToken(token, recordType);
  if (!ctx) throw new ApiError(404, "Not found");
  if (ctx.record.acknowledgedAt) throw new ApiError(409, "Already acknowledged");
  if (isExpired(ctx)) throw new ApiError(410, "Link expired");
  return ctx;
}

/** What the tenant sees on /confirm/[token]. The token alone doesn't say which kind of record it is. */
export async function getConfirmView(token: string): Promise<ConfirmView> {
  const ctx = (await loadByToken(token, "payment")) ?? (await loadByToken(token, "adjustment"));
  if (!ctx) throw new ApiError(404, "Not found");

  return {
    recordType: ctx.recordType,
    acknowledged: Boolean(ctx.record.acknowledgedAt),
    isExpired: isExpired(ctx),
    amount: ctx.record.amount,
    date: ctx.record.date,
    mode: ctx.record.mode,
    note: ctx.record.note,
    tenantName: ctx.tenant.name,
    propertyName: ctx.propertyName,
    unitCodes: ctx.unitCodes,
    maskedPhone: maskPhone(ctx.tenant.phone),
    lineItems: ctx.lineItems,
  };
}

export async function sendConfirmOtp(token: string, body: unknown, meta: RequestMeta): Promise<OtpSent> {
  const { recordType } = parseInput(otpSendSchema, withParams(body, { token }));
  const ctx = await loadAcknowledgeable(token, recordType);
  // Every send is a paid SMS: cap it per link and per client.
  await enforceRateLimits([
    { key: `otp:record:${ctx.record.id}`, limit: 5, windowSeconds: HOUR },
    { key: `otp:ip:${meta.ip}`, limit: 20, windowSeconds: HOUR },
  ]);

  try {
    await messaging.sendOtp(ctx.tenant.phone);
  } catch (err) {
    console.error("sendOtp:", err);
    throw new ApiError(502, "Could not send the verification code");
  }
  return { maskedPhone: maskPhone(ctx.tenant.phone) };
}

// Verifies the OTP, renders the tenant-signed PDF receipt, stores it with the
// tenant's signature, then records the acknowledgement (a compare-and-swap,
// so a racing second attempt loses cleanly).
//
// Ordering keeps every failure retryable: nothing is written until the PDF
// has rendered, files go under a fresh per-attempt folder (so a failed
// attempt never blocks the next one), and the database decides the winner.
// Whatever didn't become the acknowledged record's files is deleted.
export async function confirmRecord(token: string, body: unknown, meta: RequestMeta): Promise<Confirmed> {
  const input = parseInput(confirmSchema, withParams(body, { token }));
  const ctx = await loadAcknowledgeable(token, input.recordType);
  await enforceRateLimits([
    { key: `confirm:record:${ctx.record.id}`, limit: 10, windowSeconds: HOUR },
    { key: `confirm:ip:${meta.ip}`, limit: 30, windowSeconds: HOUR },
  ]);

  const tenantSignatureBytes = pngDataUrlToBytes(input.tenantSignaturePng);
  const otpOk = await messaging.checkOtp(ctx.tenant.phone, input.otpCode);
  if (!otpOk) throw new ApiError(400, "Incorrect or expired code");

  const otpVerifiedAt = new Date().toISOString();
  const pdfBytes = await renderReceipt(ctx, { signaturePng: tenantSignatureBytes, otpVerifiedAt });

  const folder = recordFolder(ctx.recordType === "payment" ? "payments" : "adjustments", ctx.tenant.id, ctx.record.id);
  const attemptPath = `${folder}/${randomUUID()}`;
  const tenantSignaturePath = `${attemptPath}/tenant-signature.png`;
  const pdfPath = `${attemptPath}/receipt.pdf`;
  const uploaded: string[] = [];

  try {
    await storage.upload(tenantSignaturePath, tenantSignatureBytes, "image/png");
    uploaded.push(tenantSignaturePath);
    await storage.upload(pdfPath, pdfBytes, "application/pdf");
    uploaded.push(pdfPath);

    const db = systemDb();
    const ledger = ctx.recordType === "payment" ? db.payments : db.adjustments;
    const acknowledged = await ledger.acknowledge(ctx.record.id, {
      tenant_signature_path: tenantSignaturePath,
      pdf_path: pdfPath,
      otp_verified_at: otpVerifiedAt,
    });
    if (!acknowledged) throw new ApiError(409, "Already acknowledged");
  } catch (err) {
    await storage.remove(uploaded);
    throw err;
  }

  return { receiptUrl: await storage.signedUrl(pdfPath, 3600) };
}

/** Short-lived download URL for the tenant's signed copy of the receipt. */
export async function confirmReceiptUrl(token: string, recordType: string | null): Promise<string> {
  if (recordType !== "payment" && recordType !== "adjustment") throw new ApiError(400, "Invalid request");
  const db = systemDb();
  const tokenHash = hashToken(token);
  const record =
    recordType === "payment"
      ? await db.payments.findByTokenHash(tokenHash)
      : await db.adjustments.findByTokenHash(tokenHash);
  if (!record?.acknowledged_at || !record.pdf_path) throw new ApiError(404, "Not available");
  return storage.signedUrl(record.pdf_path, 300);
}

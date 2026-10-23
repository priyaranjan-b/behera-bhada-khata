import "server-only";
import { format } from "date-fns";
import type { ConfirmView, Confirmed, OtpSent, RecordType } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import type { LedgerStatus } from "@/lib/types";
import { confirmSchema, otpSendSchema } from "@/lib/validation";
import { storage, systemDb } from "@/server/infra";
import type { ConfirmationPatch } from "@/server/ports";
import { checkOtp, sendOtp } from "@/server/messaging/twilio";
import { generateReceiptPdf } from "@/server/pdf/receipt";
import { hashToken } from "@/server/token";
import { dataUrlToBytes } from "./confirmLinks";
import { parseInput, withParams } from "./context";

// Tenant-facing and unauthenticated: possession of the unguessable token is
// the authorization, so everything here uses the unscoped system DB.

const OWNER_NAME = "Owner";

interface PendingRecord {
  recordType: RecordType;
  record: {
    id: string;
    amount: number;
    date: string;
    mode?: string;
    note: string | null;
    ownerSignaturePath: string | null;
    status: LedgerStatus;
    tokenExpiresAt: string;
  };
  tenant: { id: string; name: string; phone: string; propertyId: string };
  propertyName: string;
  lineItems: { label: string; amount: number; rentPeriodId: string }[];
}

function formatPeriod(periodMonth: string | undefined): string {
  if (!periodMonth) return "unknown period";
  return format(new Date(`${periodMonth}T00:00:00Z`), "MMMM yyyy");
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4) : phone;
}

async function loadByToken(token: string, recordType: RecordType): Promise<PendingRecord | null> {
  const db = systemDb();
  const tokenHash = hashToken(token);

  let record: PendingRecord["record"];
  let tenantId: string;
  let allocations: { rentPeriodId: string; amount: number }[];
  let lineLabel: string;

  if (recordType === "payment") {
    const payment = await db.payments.findByTokenHash(tokenHash);
    if (!payment) return null;
    record = {
      id: payment.id,
      amount: Number(payment.amount),
      date: payment.payment_date,
      mode: payment.mode,
      note: payment.note,
      ownerSignaturePath: payment.owner_signature_path,
      status: payment.status,
      tokenExpiresAt: payment.token_expires_at,
    };
    tenantId = payment.tenant_id;
    allocations = (await db.payments.listAllocations(payment.id)).map((a) => ({
      rentPeriodId: a.rent_period_id,
      amount: Number(a.amount_allocated),
    }));
    lineLabel = "Rent for";
  } else {
    const adjustment = await db.adjustments.findByTokenHash(tokenHash);
    if (!adjustment) return null;
    record = {
      id: adjustment.id,
      amount: Number(adjustment.delta_amount),
      date: format(new Date(adjustment.created_at), "yyyy-MM-dd"),
      note: adjustment.reason,
      ownerSignaturePath: adjustment.owner_signature_path,
      status: adjustment.status,
      tokenExpiresAt: adjustment.token_expires_at,
    };
    tenantId = adjustment.tenant_id;
    allocations = (await db.adjustments.listAllocations(adjustment.id)).map((a) => ({
      rentPeriodId: a.rent_period_id,
      amount: Number(a.amount_delta),
    }));
    lineLabel = "Adjustment for";
  }

  const tenant = await db.tenants.get(tenantId);
  if (!tenant) return null;
  const [property, periods] = await Promise.all([
    db.properties.get(tenant.property_id),
    db.rentPeriods.listByIds(allocations.map((a) => a.rentPeriodId)),
  ]);
  const periodMonthById = new Map(periods.map((p) => [p.id, p.period_month]));

  return {
    recordType,
    record,
    tenant: { id: tenant.id, name: tenant.name, phone: tenant.phone, propertyId: tenant.property_id },
    propertyName: property?.name ?? "Property",
    lineItems: allocations.map((a) => ({
      label: `${lineLabel} ${formatPeriod(periodMonthById.get(a.rentPeriodId))}`,
      amount: a.amount,
      rentPeriodId: a.rentPeriodId,
    })),
  };
}

function isExpired(ctx: PendingRecord): boolean {
  return ctx.record.status === "pending" && new Date(ctx.record.tokenExpiresAt) < new Date();
}

/** Loads the record and rejects anything that can no longer be confirmed. */
async function loadConfirmable(token: string, recordType: RecordType): Promise<PendingRecord> {
  const ctx = await loadByToken(token, recordType);
  if (!ctx) throw new ApiError(404, "Not found");
  if (ctx.record.status !== "pending") throw new ApiError(409, "Already confirmed");
  if (isExpired(ctx)) throw new ApiError(410, "Link expired");
  return ctx;
}

/** What the tenant sees on /confirm/[token]. The token alone doesn't say which kind of record it is. */
export async function getConfirmView(token: string): Promise<ConfirmView> {
  const ctx = (await loadByToken(token, "payment")) ?? (await loadByToken(token, "adjustment"));
  if (!ctx) throw new ApiError(404, "Not found");

  return {
    recordType: ctx.recordType,
    status: ctx.record.status,
    isExpired: isExpired(ctx),
    amount: ctx.record.amount,
    date: ctx.record.date,
    mode: ctx.record.mode,
    note: ctx.record.note,
    tenantName: ctx.tenant.name,
    propertyName: ctx.propertyName,
    maskedPhone: maskPhone(ctx.tenant.phone),
    lineItems: ctx.lineItems,
  };
}

export async function sendConfirmOtp(token: string, body: unknown): Promise<OtpSent> {
  const { recordType } = parseInput(otpSendSchema, withParams(body, { token }));
  const ctx = await loadConfirmable(token, recordType);

  try {
    await sendOtp(ctx.tenant.phone);
  } catch {
    throw new ApiError(502, "Could not send the verification code");
  }
  return { maskedPhone: maskPhone(ctx.tenant.phone) };
}

// Verifies the OTP, stores the tenant's signature, renders the signed PDF
// receipt, then flips the record to confirmed and applies its allocations.
export async function confirmRecord(token: string, body: unknown): Promise<Confirmed> {
  const input = parseInput(confirmSchema, withParams(body, { token }));
  const ctx = await loadConfirmable(token, input.recordType);
  const ownerSignaturePath = ctx.record.ownerSignaturePath;
  if (!ownerSignaturePath) throw new ApiError(500, "Owner signature missing on this record");

  const otpOk = await checkOtp(ctx.tenant.phone, input.otpCode);
  if (!otpOk) throw new ApiError(400, "Incorrect or expired code");

  const basePath = `${ctx.recordType}s/${ctx.tenant.propertyId}/${ctx.tenant.id}/${ctx.record.id}`;
  const tenantSignatureBytes = dataUrlToBytes(input.tenantSignaturePng);
  const tenantSignaturePath = `${basePath}/tenant-signature.png`;

  let ownerSignatureBytes: Uint8Array;
  try {
    ownerSignatureBytes = await storage.download(ownerSignaturePath);
  } catch {
    throw new ApiError(500, "Owner signature missing on this record");
  }

  try {
    await storage.upload(tenantSignaturePath, tenantSignatureBytes, "image/png");
  } catch {
    // The path is per-record and uploads never overwrite, so this means a
    // concurrent confirmation got here first.
    throw new ApiError(409, "Already confirmed");
  }

  const otpVerifiedAt = new Date().toISOString();
  const pdfBytes = await generateReceiptPdf({
    title: ctx.recordType === "payment" ? "Rent Payment Receipt" : "Rent Payment Adjustment",
    recordId: ctx.record.id,
    ownerName: OWNER_NAME,
    tenantName: ctx.tenant.name,
    propertyName: ctx.propertyName,
    totalAmount: ctx.record.amount,
    date: ctx.record.date,
    mode: ctx.record.mode,
    note: ctx.record.note,
    lineItems: ctx.lineItems,
    ownerSignaturePng: ownerSignatureBytes,
    tenantSignaturePng: tenantSignatureBytes,
    otpVerifiedAt,
    confirmedAt: otpVerifiedAt,
  });

  const pdfPath = `${basePath}/receipt.pdf`;
  await storage.upload(pdfPath, pdfBytes, "application/pdf");

  const updated = await applyConfirmation(ctx, {
    tenant_signature_path: tenantSignaturePath,
    pdf_path: pdfPath,
    otp_verified_at: otpVerifiedAt,
    confirmed_at: new Date().toISOString(),
  });
  if (!updated) throw new ApiError(409, "Already confirmed");

  return { receiptUrl: await storage.signedUrl(pdfPath, 3600) };
}

// Flips pending -> confirmed (a compare-and-swap, so a racing second request
// gets false) and only then moves rent_periods.amount_allocated.
async function applyConfirmation(
  ctx: PendingRecord,
  patch: ConfirmationPatch
): Promise<boolean> {
  const db = systemDb();
  const ledger = ctx.recordType === "payment" ? db.payments : db.adjustments;
  if (!(await ledger.confirm(ctx.record.id, patch))) return false;

  for (const item of ctx.lineItems) {
    await db.rentPeriods.addToAllocated(item.rentPeriodId, item.amount);
  }
  return true;
}

/** Short-lived download URL for the tenant's copy of a confirmed receipt. */
export async function confirmReceiptUrl(token: string, recordType: string | null): Promise<string> {
  if (recordType !== "payment" && recordType !== "adjustment") throw new ApiError(400, "Invalid request");
  const db = systemDb();
  const tokenHash = hashToken(token);
  const record =
    recordType === "payment"
      ? await db.payments.findByTokenHash(tokenHash)
      : await db.adjustments.findByTokenHash(tokenHash);
  if (!record || record.status !== "confirmed" || !record.pdf_path) throw new ApiError(404, "Not available");
  return storage.signedUrl(record.pdf_path, 300);
}

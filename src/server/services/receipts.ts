import "server-only";
import type { RecordType } from "@/lib/contracts";
import { dateKeyOf, formatMonth } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import type {
  Adjustment,
  AdjustmentAllocation,
  Location,
  Payment,
  PaymentAllocation,
  PaymentProof,
  Property,
  RentPeriod,
  Tenant,
  UnitOccupancy,
} from "@/lib/types";
import { auth, storage } from "@/server/infra";
import type { OwnerRepositories, SystemRepositories } from "@/server/ports";
import { generateReceiptPdf, type ReceiptProof } from "@/server/pdf/receipt";
import { currentTenancies } from "./placements";

// Everything a receipt (and the tenant's /confirm page) shows about one
// payment or adjustment, built the same way whether the owner downloads it
// or the tenant opens their link.

/** The reads a receipt needs; satisfied by both the owner and the system repositories. */
export interface ReceiptReads {
  tenant(id: string): Promise<Tenant | null>;
  tenancies(tenantId: string): Promise<UnitOccupancy[]>;
  periods(ids: string[]): Promise<RentPeriod[]>;
  property(code: string): Promise<Property | null>;
  location(code: string): Promise<Location | null>;
  /** An adjustment receipt cites the receipt number of the payment it corrects. */
  payment(id: string): Promise<Payment | null>;
  proofs(paymentId: string): Promise<PaymentProof[]>;
}

export function ownerReceiptReads(db: OwnerRepositories): ReceiptReads {
  return {
    tenant: (id) => db.tenants.get(id),
    tenancies: (tenantId) => db.occupancy.list({ tenantIds: [tenantId] }),
    periods: (ids) => db.rentPeriods.listByIds(ids),
    property: (code) => db.properties.get(code),
    location: async (code) => (await db.locations.list()).find((l) => l.location_code === code) ?? null,
    payment: (id) => db.payments.get(id),
    proofs: (paymentId) => db.payments.listProofs([paymentId]),
  };
}

export function systemReceiptReads(db: SystemRepositories): ReceiptReads {
  return {
    tenant: (id) => db.tenants.get(id),
    tenancies: (tenantId) => db.occupancy.listForTenant(tenantId),
    periods: (ids) => db.rentPeriods.listByIds(ids),
    property: (code) => db.properties.get(code),
    location: (code) => db.locations.get(code),
    payment: (id) => db.payments.get(id),
    proofs: (paymentId) => db.payments.listProofs([paymentId]),
  };
}

export type LedgerRecord =
  | { recordType: "payment"; row: Payment; allocations: PaymentAllocation[] }
  | { recordType: "adjustment"; row: Adjustment; allocations: AdjustmentAllocation[] };

export interface RecordDetails {
  recordType: RecordType;
  record: {
    id: string;
    /** 2026/10/001 (ADJ/... for an adjustment), printed instead of the uuid (0012). */
    receiptNo: string;
    /** An adjustment: the receipt number of the payment it corrects. */
    correctsReceiptNo: string | null;
    amount: number;
    date: string;
    mode?: string;
    note: string | null;
    ownerSignaturePath: string | null;
    tenantSignaturePath: string | null;
    /** The tenant's signed copy, stored when they acknowledged. */
    pdfPath: string | null;
    otpVerifiedAt: string | null;
    acknowledgedAt: string | null;
    recordedAt: string;
    tokenExpiresAt: string;
  };
  tenant: { id: string; name: string; businessName: string | null; phone: string | null };
  propertyName: string;
  unitCodes: string[];
  /** `periodMonth`: the rent month (yyyy-MM-01), "" if unknown. */
  lineItems: { label: string; amount: number; rentPeriodId: string; periodMonth: string }[];
  /** Payments only: attached proof files, appended to the PDF. */
  proofs: Pick<PaymentProof, "storage_path" | "file_name" | "content_type">[];
}

export async function describeRecord(reads: ReceiptReads, source: LedgerRecord): Promise<RecordDetails | null> {
  const { row } = source;
  const tenant = await reads.tenant(row.tenant_id);
  if (!tenant) return null;

  const allocations =
    source.recordType === "payment"
      ? source.allocations.map((a) => ({ rentPeriodId: a.rent_period_id, amount: Number(a.amount_allocated) }))
      : source.allocations.map((a) => ({ rentPeriodId: a.rent_period_id, amount: Number(a.amount_delta) }));
  const [history, periods, proofs, original] = await Promise.all([
    reads.tenancies(tenant.id),
    reads.periods(allocations.map((a) => a.rentPeriodId)),
    source.recordType === "payment" ? reads.proofs(row.id) : Promise.resolve([]),
    source.recordType === "adjustment" ? reads.payment(source.row.original_payment_id) : Promise.resolve(null),
  ]);
  const periodMonthById = new Map(periods.map((p) => [p.id, p.period_month]));
  // The houses the tenant holds (or last held) - what this rent is for.
  const houses = currentTenancies(history).sort((a, b) => a.unit_code.localeCompare(b.unit_code));
  const propertyCodes = [...new Set(houses.map((h) => h.property_code))];
  const properties = await Promise.all(propertyCodes.map((code) => reads.property(code)));
  const locationCodes = [...new Set(properties.flatMap((p) => (p ? [p.location_code] : [])))];
  const locations = new Map(
    (await Promise.all(locationCodes.map((code) => reads.location(code)))).flatMap((l) => (l ? [[l.location_code, l.name]] : []))
  );
  // "Arnapal Chakk Complex, Tower 1"; towers in another site after a "; ".
  const placeName = (p: Property | null, i: number) =>
    p ? [locations.get(p.location_code), p.name].filter(Boolean).join(", ") : propertyCodes[i];
  const lineLabel = source.recordType === "payment" ? "Rent for" : "Adjustment for";

  return {
    recordType: source.recordType,
    record: {
      id: row.id,
      receiptNo: row.receipt_no,
      correctsReceiptNo: original?.receipt_no ?? null,
      amount: Number(source.recordType === "payment" ? source.row.amount : source.row.delta_amount),
      date: source.recordType === "payment" ? source.row.payment_date : dateKeyOf(row.created_at),
      mode: source.recordType === "payment" ? source.row.mode : undefined,
      note: source.recordType === "payment" ? source.row.note : source.row.reason,
      ownerSignaturePath: row.owner_signature_path,
      tenantSignaturePath: row.tenant_signature_path,
      pdfPath: row.pdf_path,
      otpVerifiedAt: row.otp_verified_at,
      acknowledgedAt: row.acknowledged_at,
      recordedAt: row.confirmed_at ?? row.created_at,
      tokenExpiresAt: row.token_expires_at,
    },
    tenant: { id: tenant.id, name: tenant.name, businessName: tenant.business_name, phone: tenant.phone },
    propertyName: properties.map(placeName).join("; ") || "Property",
    unitCodes: houses.map((h) => h.unit_code),
    lineItems: allocations
      .map((a) => ({ ...a, periodMonth: periodMonthById.get(a.rentPeriodId) ?? "" }))
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
      .map((a) => ({
        label: `${lineLabel} ${a.periodMonth ? formatMonth(a.periodMonth) : "unknown period"}`,
        amount: a.amount,
        rentPeriodId: a.rentPeriodId,
        periodMonth: a.periodMonth,
      })),
    proofs: proofs.map((p) => ({ storage_path: p.storage_path, file_name: p.file_name, content_type: p.content_type })),
  };
}

async function downloadSignature(path: string | null): Promise<Uint8Array> {
  if (!path) throw new ApiError(500, "Owner signature missing on this record");
  try {
    return await storage.download(path);
  } catch (err) {
    console.error(err);
    throw new ApiError(500, "Owner signature missing on this record");
  }
}

/** Proof files for the PDF; one that can't be downloaded is left out rather than failing the receipt. */
async function downloadProofs(proofs: RecordDetails["proofs"]): Promise<ReceiptProof[]> {
  const files = await Promise.all(
    proofs.map(async (p) => {
      try {
        return { fileName: p.file_name, contentType: p.content_type, bytes: await storage.download(p.storage_path) };
      } catch (err) {
        console.error("receipt: proof download failed:", err);
        return null;
      }
    })
  );
  return files.filter((f) => f !== null);
}

/**
 * Renders the receipt PDF. With `tenant` it's the acknowledged copy carrying
 * the tenant's signature; without, the owner's copy, which exists from the
 * moment the payment is recorded.
 */
export async function renderReceipt(
  details: RecordDetails,
  tenant?: { signaturePng: Uint8Array; otpVerifiedAt: string }
): Promise<Uint8Array> {
  const [ownerSignaturePng, names, proofs] = await Promise.all([
    downloadSignature(details.record.ownerSignaturePath),
    auth.ownerNames(),
    downloadProofs(details.proofs),
  ]);
  return generateReceiptPdf({
    kind: details.recordType,
    receiptNo: details.record.receiptNo,
    correctsReceiptNo: details.record.correctsReceiptNo,
    ownerName: names?.owner ?? "Owner",
    signatureName: names?.signature ?? names?.owner ?? "Owner",
    tenantName: details.tenant.name,
    tenantBusiness: details.tenant.businessName,
    propertyName: details.propertyName,
    unitCodes: details.unitCodes,
    totalAmount: details.record.amount,
    date: details.record.date,
    mode: details.record.mode,
    note: details.record.note,
    lineItems: details.lineItems,
    ownerSignaturePng,
    tenantSignaturePng: tenant?.signaturePng,
    otpVerifiedAt: tenant?.otpVerifiedAt,
    recordedAt: details.record.recordedAt,
    proofs,
  });
}

/** The owner's download: the tenant-signed copy once acknowledged, else a fresh owner copy. */
export async function receiptFile(details: RecordDetails): Promise<{ bytes: Uint8Array; fileName: string }> {
  const bytes =
    details.record.acknowledgedAt && details.record.pdfPath
      ? await storage.download(details.record.pdfPath)
      : await renderReceipt(details);
  // File names can't hold the slashes: receipt-2026-10-001.pdf, adjustment-ADJ-2026-10-001.pdf.
  const number = details.record.receiptNo.replaceAll("/", "-");
  return { bytes, fileName: `${details.recordType === "payment" ? "receipt" : "adjustment"}-${number}.pdf` };
}

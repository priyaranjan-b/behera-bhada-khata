import "server-only";
import type { RecordType } from "@/lib/contracts";
import { dateKeyOf, formatMonth } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import type {
  Adjustment,
  AdjustmentAllocation,
  Payment,
  PaymentAllocation,
  Property,
  RentPeriod,
  Tenant,
  UnitOccupancy,
} from "@/lib/types";
import { auth, storage } from "@/server/infra";
import type { OwnerRepositories, SystemRepositories } from "@/server/ports";
import { generateReceiptPdf } from "@/server/pdf/receipt";
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
}

export function ownerReceiptReads(db: OwnerRepositories): ReceiptReads {
  return {
    tenant: (id) => db.tenants.get(id),
    tenancies: (tenantId) => db.occupancy.list({ tenantIds: [tenantId] }),
    periods: (ids) => db.rentPeriods.listByIds(ids),
    property: (code) => db.properties.get(code),
  };
}

export function systemReceiptReads(db: SystemRepositories): ReceiptReads {
  return {
    tenant: (id) => db.tenants.get(id),
    tenancies: (tenantId) => db.occupancy.listForTenant(tenantId),
    periods: (ids) => db.rentPeriods.listByIds(ids),
    property: (code) => db.properties.get(code),
  };
}

export type LedgerRecord =
  | { recordType: "payment"; row: Payment; allocations: PaymentAllocation[] }
  | { recordType: "adjustment"; row: Adjustment; allocations: AdjustmentAllocation[] };

export interface RecordDetails {
  recordType: RecordType;
  record: {
    id: string;
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
  tenant: { id: string; name: string; phone: string | null };
  propertyName: string;
  unitCodes: string[];
  lineItems: { label: string; amount: number; rentPeriodId: string }[];
}

export async function describeRecord(reads: ReceiptReads, source: LedgerRecord): Promise<RecordDetails | null> {
  const { row } = source;
  const tenant = await reads.tenant(row.tenant_id);
  if (!tenant) return null;

  const allocations =
    source.recordType === "payment"
      ? source.allocations.map((a) => ({ rentPeriodId: a.rent_period_id, amount: Number(a.amount_allocated) }))
      : source.allocations.map((a) => ({ rentPeriodId: a.rent_period_id, amount: Number(a.amount_delta) }));
  const [history, periods] = await Promise.all([
    reads.tenancies(tenant.id),
    reads.periods(allocations.map((a) => a.rentPeriodId)),
  ]);
  const periodMonthById = new Map(periods.map((p) => [p.id, p.period_month]));
  // The houses the tenant holds (or last held) - what this rent is for.
  const houses = currentTenancies(history).sort((a, b) => a.unit_code.localeCompare(b.unit_code));
  const propertyCodes = [...new Set(houses.map((h) => h.property_code))];
  const properties = await Promise.all(propertyCodes.map((code) => reads.property(code)));
  const lineLabel = source.recordType === "payment" ? "Rent for" : "Adjustment for";

  return {
    recordType: source.recordType,
    record: {
      id: row.id,
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
    tenant: { id: tenant.id, name: tenant.name, phone: tenant.phone },
    propertyName: properties.map((p, i) => p?.name ?? propertyCodes[i]).join(", ") || "Property",
    unitCodes: houses.map((h) => h.unit_code),
    lineItems: allocations
      .map((a) => ({ ...a, periodMonth: periodMonthById.get(a.rentPeriodId) ?? "" }))
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
      .map((a) => ({
        label: `${lineLabel} ${a.periodMonth ? formatMonth(a.periodMonth) : "unknown period"}`,
        amount: a.amount,
        rentPeriodId: a.rentPeriodId,
      })),
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

/**
 * Renders the receipt PDF. With `tenant` it's the acknowledged copy carrying
 * the tenant's signature; without, the owner's copy, which exists from the
 * moment the payment is recorded.
 */
export async function renderReceipt(
  details: RecordDetails,
  tenant?: { signaturePng: Uint8Array; otpVerifiedAt: string }
): Promise<Uint8Array> {
  const ownerSignaturePng = await downloadSignature(details.record.ownerSignaturePath);
  return generateReceiptPdf({
    title: details.recordType === "payment" ? "Rent Payment Receipt" : "Rent Payment Adjustment",
    recordId: details.record.id,
    ownerName: (await auth.ownerDisplayName()) ?? "Owner",
    tenantName: details.tenant.name,
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
  });
}

/** The owner's download: the tenant-signed copy once acknowledged, else a fresh owner copy. */
export async function receiptFile(details: RecordDetails): Promise<{ bytes: Uint8Array; fileName: string }> {
  const bytes =
    details.record.acknowledgedAt && details.record.pdfPath
      ? await storage.download(details.record.pdfPath)
      : await renderReceipt(details);
  const who = details.tenant.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "tenant";
  return { bytes, fileName: `${details.recordType === "payment" ? "receipt" : "adjustment"}-${who}-${details.record.date}.pdf` };
}

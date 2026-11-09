import "server-only";
import type {
  RecordType,
  TenantAccount,
  TenantDetail,
  TenantDocumentView,
  TenantLedgerView,
  TenantMonthsPage,
} from "@/lib/contracts";
import { tenantLedgerQuerySchema, tenantMonthsQuerySchema } from "@/lib/validation";
import { storage, systemDb, tenantDb } from "@/server/infra";
import type { TenantRepositories } from "@/server/ports";
import type { Tenant } from "@/lib/types";
import { recordSystemEvent } from "./audit";
import {
  enforceRateLimits,
  notFound,
  parseInput,
  RATE_LIMITS,
  requireId,
  SIGNED_URL_SECONDS,
  type TenantContext,
} from "./context";
import { billedTenantIds, ensureRentPeriodsFor } from "./periods";
import { loadPlacements } from "./placements";
import { describeRecord, receiptFile, systemReceiptReads } from "./receipts";
import { tenantAccountOf, tenantDetailOf, tenantLedgerOf, tenantMonthsOf } from "./tenantAccount";
import { listTenantDocuments } from "./tenantDocuments";

// The tenant portal (A32): a signed-in tenant's own account, read-only. Every
// read goes through tenantDb(ctx.tenantId) - the tenant_reader role, whose
// RLS shows that tenant's rows and nothing else - and every id the request
// names (a receipt, proof or document) must be one of theirs, else 404. There
// is nothing here that writes, apart from the rent-month upkeep the owner's
// page runs too and the audit of downloads.

/** The signed-in tenant's row; a session whose tenant can't be read is over. */
async function myTenant(db: TenantRepositories, ctx: TenantContext): Promise<Tenant> {
  const tenant = await db.tenants.get(ctx.tenantId);
  if (!tenant) notFound("Tenant");
  return tenant;
}

/** Their months billed ahead must exist before they're shown or counted (as on the owner's page). */
async function myBilledTenant(db: TenantRepositories, ctx: TenantContext): Promise<Tenant> {
  const tenant = await myTenant(db, ctx);
  await ensureRentPeriodsFor(billedTenantIds([tenant]));
  return tenant;
}

/** Who they are, their houses and rents. */
export async function getMyProfile(ctx: TenantContext): Promise<TenantDetail> {
  const db = tenantDb(ctx.tenantId);
  const [tenant, placements] = await Promise.all([myTenant(db, ctx), loadPlacements(db, [ctx.tenantId])]);
  return tenantDetailOf(tenant, placements);
}

/** What they owe, to the end of last month. */
export async function getMyAccount(ctx: TenantContext): Promise<TenantAccount> {
  const db = tenantDb(ctx.tenantId);
  await myBilledTenant(db, ctx);
  return tenantAccountOf(db, ctx.tenantId);
}

/** One page of their rent months (A15). */
export async function getMyMonths(ctx: TenantContext, query: unknown): Promise<TenantMonthsPage> {
  const q = parseInput(tenantMonthsQuerySchema, query);
  const db = tenantDb(ctx.tenantId);
  await myBilledTenant(db, ctx);
  return tenantMonthsOf(db, ctx.tenantId, q);
}

/** One page of their ledger with the running balance (A15). Never offers to send a link: that's the owner's. */
export async function getMyLedger(ctx: TenantContext, query: unknown): Promise<TenantLedgerView> {
  const q = parseInput(tenantLedgerQuerySchema, query);
  const db = tenantDb(ctx.tenantId);
  await myBilledTenant(db, ctx);
  return tenantLedgerOf(db, ctx.tenantId, q, { tenantMessaging: false, audience: "tenant" });
}

/**
 * The files the owner keeps on them (agreement, ID proof...), to view and
 * download - while they're a current tenant. Once moved out, none: the
 * number may have passed to someone else by now (A32), and ID proofs are
 * the worst thing to hand them.
 */
export async function getMyDocuments(ctx: TenantContext): Promise<TenantDocumentView[]> {
  const db = tenantDb(ctx.tenantId);
  if ((await myTenant(db, ctx)).status !== "active") return [];
  return listTenantDocuments(db, ctx.tenantId);
}

/** Downloads cost more than a page read (a PDF render, a signed URL): their own budget per session. */
async function countDownload(ctx: TenantContext): Promise<void> {
  await enforceRateLimits([{ key: `tenant-download:${ctx.sessionId}`, ...RATE_LIMITS.tenantDownloadsPerHour }]);
}

/** A short-lived URL for one of their documents; 404 for anyone else's. */
export async function myDocumentUrl(ctx: TenantContext, documentId: string): Promise<string> {
  requireId(documentId, "Document");
  await countDownload(ctx);
  const db = tenantDb(ctx.tenantId);
  if ((await myTenant(db, ctx)).status !== "active") notFound("Document");
  const doc = await db.tenantDocuments.get(documentId);
  if (!doc || doc.tenant_id !== ctx.tenantId) notFound("Document");
  return storage.signedUrl(doc.storage_path, SIGNED_URL_SECONDS);
}

/** A short-lived URL for a proof attached to one of their payments; 404 for anyone else's. */
export async function myProofUrl(ctx: TenantContext, paymentId: string, proofId: string): Promise<string> {
  requireId(paymentId, "Payment");
  requireId(proofId, "Proof");
  await countDownload(ctx);
  const proof = await tenantDb(ctx.tenantId).payments.getProof(proofId);
  if (!proof || proof.payment_id !== paymentId) notFound("Proof");
  return storage.signedUrl(proof.storage_path, SIGNED_URL_SECONDS);
}

/**
 * The PDF receipt of one of their payments or adjustments: the copy they
 * signed if they acknowledged it, else the owner's copy. 404 for anyone
 * else's: the tenant's own read must find it before the receipt is built.
 */
export async function myReceipt(
  ctx: TenantContext,
  recordType: RecordType,
  recordId: string
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const what = recordType === "payment" ? "Payment" : "Adjustment";
  requireId(recordId, what);
  await countDownload(ctx);
  if (!(await tenantDb(ctx.tenantId).records.exists(recordType, recordId))) notFound(what);

  // The receipt needs what the tenant role can't read (signatures, the stored
  // PDF, the owner's name): the system reads, for this record only.
  const sys = systemDb();
  const reads = systemReceiptReads(sys);
  let details;
  let receiptNo: string;
  if (recordType === "payment") {
    const row = await sys.payments.get(recordId);
    if (!row || row.tenant_id !== ctx.tenantId) notFound(what);
    receiptNo = row.receipt_no;
    details = await describeRecord(reads, { recordType, row, allocations: await sys.payments.listAllocations(recordId) });
  } else {
    const row = await sys.adjustments.get(recordId);
    if (!row || row.tenant_id !== ctx.tenantId) notFound(what);
    receiptNo = row.receipt_no;
    details = await describeRecord(reads, { recordType, row, allocations: await sys.adjustments.listAllocations(recordId) });
  }
  if (!details) notFound("Tenant");
  const file = await receiptFile(details);
  await recordSystemEvent({
    action: "receipt.downloaded",
    actorKind: "tenant",
    tenantId: ctx.tenantId,
    entityType: recordType,
    entityId: recordId,
    context: { receiptNo, by: "tenant" },
  });
  return file;
}

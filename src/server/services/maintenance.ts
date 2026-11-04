import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Created,
  MaintenanceDetail,
  MaintenanceFileView,
  MaintenanceFilesSaved,
  MaintenanceForm,
  MaintenanceListRow,
  MaintenancePage,
  MaintenancePrefill,
} from "@/lib/contracts";
import { todayKey } from "@/lib/dates";
import { maintenanceRange } from "@/lib/domain/maintenance";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { ApiError } from "@/lib/errors";
import type { MaintenanceFile } from "@/lib/types";
import {
  MAINTENANCE_FILE_LIMITS,
  MAINTENANCE_LIMITS,
  PAYMENT_TAG_LIMITS,
  createMaintenanceSchema,
  maintenanceFormQuerySchema,
  maintenancePageQuerySchema,
  setPaymentTagsSchema,
  updateMaintenanceSchema,
  voidMaintenanceSchema,
} from "@/lib/validation";
import { ownerDb, storage } from "@/server/infra";
import type { MaintenanceExpenseFields, MaintenanceExpenseRecord, NewMaintenanceFile, OwnerRepositories } from "@/server/ports";
import { notFound, parseInput, requireId, SIGNED_URL_SECONDS, type OwnerContext, type UploadedFile } from "./context";
import { withUploadedFile } from "./confirmLinks";
import { db as cachedDb } from "./loaders";
import { checkNewTags, paymentTagSuggestions } from "./paymentTags";
import { checkProofFiles, storeFiles } from "./proofs";

// Maintenance expenses (0031, D35): money the owner spends on the houses, on
// one house or split equally over several. Unlike the rent ledger, an expense
// is edited, or voided (kept, counted nowhere); the database logs every
// change. Receipts live in the private bucket under maintenance/<id>/files/.

// The grid's fields → the columns the Maintenance query reads.
const SORT_COLUMNS = {
  expenseDate: "expense_date",
  description: "description",
  category: "category",
  amount: "amount",
  unitsText: "units_text",
} as const;
const FILTER_COLUMNS = {
  expenseDate: "date",
  description: "description",
  category: "category",
  unitsText: "units",
  vendor: "vendor",
  note: "note",
  tags: "tags",
  status: "status",
} as const;

const folderOf = (expenseId: string) => `maintenance/${expenseId}/files`;

/** One page of the Maintenance grid (default: this month), with the totals of every expense that matches. */
export async function getMaintenancePage(_ctx: OwnerContext, query: unknown = {}): Promise<MaintenancePage> {
  const input = parseInput(maintenancePageQuerySchema, query ?? {});
  const range = maintenanceRange(input, MAINTENANCE_LIMITS.maxDays);
  const result = await (await cachedDb()).maintenance.page({
    ...range,
    search: input.q || undefined,
    filters: input.filters.map((f) => ({ ...f, field: FILTER_COLUMNS[f.field] })),
    logic: input.logic,
    sort: SORT_COLUMNS[input.sort],
    dir: input.dir,
    page: input.page,
    pageSize: input.pageSize,
  });
  const t = result.totals;
  return {
    ...range,
    rows: result.rows.map(
      (r): MaintenanceListRow => ({
        id: r.id,
        expenseDate: r.expense_date,
        amount: r.amount,
        category: r.category,
        description: r.description,
        vendor: r.vendor,
        note: r.note,
        voided: r.voided,
        unitCodes: r.unit_codes,
        tags: r.tags,
        fileCount: r.file_count,
      })
    ),
    total: result.total,
    all: result.all,
    page: result.page,
    totals: {
      amount: t.amount,
      cash: t.cash,
      count: t.count,
      byCategory: t.by_category,
      byPaidBy: t.by_tag,
      untagged: t.untagged,
    },
  };
}

/**
 * A set-off payment as a new expense's starting values (A22): the money the
 * tenant kept back paid for something the owner bought from them. Null for
 * any other payment, or one that doesn't exist.
 */
async function prefillFrom(db: OwnerRepositories, paymentId: string | undefined): Promise<MaintenancePrefill | null> {
  if (!paymentId) return null;
  const payment = await db.payments.get(paymentId);
  if (!payment || payment.mode !== "set_off") {
    console.warn(`maintenance prefill ignored: payment ${paymentId} ${payment ? `is ${payment.mode}, not a set-off` : "not found"}`);
    return null;
  }
  const tenant = await db.tenants.get(payment.tenant_id);
  if (!tenant) console.warn(`maintenance prefill: tenant ${payment.tenant_id} of payment ${paymentId} not found`);
  const name = tenant ? tenantDisplayName(tenant) : "";
  const receipt = payment.receipt_no ? `, receipt ${payment.receipt_no}` : "";
  return {
    paymentId: payment.id,
    amount: payment.amount,
    expenseDate: payment.payment_date,
    description: (payment.note ?? "").slice(0, MAINTENANCE_LIMITS.descriptionMax),
    vendor: name.slice(0, MAINTENANCE_LIMITS.vendorMax),
    tags: name ? [name.slice(0, PAYMENT_TAG_LIMITS.maxLength)] : [],
    note: `Set off against rent${receipt}`,
  };
}

/** The Record maintenance form: every house in use, by tower, the who-paid suggestions, and a set-off's values if started from one. */
export async function getMaintenanceForm(_ctx: OwnerContext, query: unknown = {}): Promise<MaintenanceForm> {
  const { fromPayment } = parseInput(maintenanceFormQuerySchema, query ?? {});
  const db = await ownerDb();
  const [units, properties, tagSuggestions, prefill] = [
    await db.units.list(),
    await db.properties.list(),
    await paymentTagSuggestions(db),
    await prefillFrom(db, fromPayment),
  ];
  const towerName = new Map(properties.map((p) => [p.property_code, p.name]));
  return {
    houses: units
      .filter((u) => u.is_active)
      .map((u) => ({
        unitCode: u.unit_code,
        propertyCode: u.property_code,
        propertyName: towerName.get(u.property_code) ?? u.property_code,
        label: u.label,
      }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode) || a.unitCode.localeCompare(b.unitCode)),
    tagSuggestions,
    prefill,
  };
}

function fileView(f: MaintenanceFile): MaintenanceFileView {
  return { id: f.id, fileName: f.file_name, contentType: f.content_type, sizeBytes: f.size_bytes, uploadedAt: f.created_at };
}

function toDetail(r: MaintenanceExpenseRecord): MaintenanceDetail {
  const e = r.expense;
  return {
    id: e.id,
    expenseDate: e.expense_date,
    amount: e.amount,
    category: e.category,
    description: e.description,
    vendor: e.vendor,
    note: e.note,
    voidedAt: e.voided_at,
    voidReason: e.void_reason,
    recordedAt: e.created_at,
    settledBy: e.settled_by_payment_id ? { paymentId: e.settled_by_payment_id, receiptNo: r.settled_by_receipt_no } : null,
    houses: r.units.map((u) => ({
      unitCode: u.unit_code,
      propertyCode: u.property_code,
      propertyName: u.property_name,
      label: u.label,
      share: u.share_amount,
    })),
    tags: r.tags,
    files: r.files.map(fileView),
  };
}

async function requireExpense(db: OwnerRepositories, expenseId: string): Promise<MaintenanceExpenseRecord> {
  requireId(expenseId, "Expense");
  const record = await db.maintenance.get(expenseId);
  if (!record) notFound("Expense");
  return record;
}

export async function getMaintenanceExpense(_ctx: OwnerContext, expenseId: string): Promise<MaintenanceDetail> {
  return toDetail(await requireExpense(await ownerDb(), expenseId));
}

/** The fields as stored; a future date is refused (today is the app's, Asia/Kolkata). */
function fieldsOf(input: {
  expenseDate: string;
  amount: number;
  category: MaintenanceExpenseFields["category"];
  description: string;
  vendor?: string;
  note?: string;
}): MaintenanceExpenseFields {
  if (input.expenseDate > todayKey()) throw new ApiError(400, "The date can't be in the future");
  return {
    expense_date: input.expenseDate,
    amount: input.amount,
    category: input.category,
    description: input.description,
    vendor: input.vendor || null,
    note: input.note || null,
  };
}

/** Uploads checked files under the expense's folder (a fresh prefix keeps names unique across uploads). */
async function storeExpenseFiles(expenseId: string, files: UploadedFile[]): Promise<NewMaintenanceFile[]> {
  const checked = checkProofFiles(files, "receipts", MAINTENANCE_FILE_LIMITS);
  const stored = await storeFiles(folderOf(expenseId), checked, "receipts", `${randomUUID().slice(0, 8)}-`);
  return stored.map((f) => ({ ...f, expense_id: expenseId }));
}

/** Records an expense on its houses (split equally), who paid it and its receipts, all or nothing. */
export async function createMaintenanceExpense(_ctx: OwnerContext, body: unknown, files: UploadedFile[] = []): Promise<Created> {
  const input = parseInput(createMaintenanceSchema, body);
  const fields = fieldsOf(input);
  checkProofFiles(files, "receipts", MAINTENANCE_FILE_LIMITS);
  const db = await ownerDb();
  await checkNewTags(db, input.tags);
  const id = randomUUID();
  const rows = await storeExpenseFiles(id, files);
  await withUploadedFile(
    rows.map((r) => r.storage_path),
    () => db.maintenance.create(id, fields, input.unitCodes, input.tags, rows, input.settledByPaymentId ?? null)
  );
  return { id };
}

/** Changes every field and the houses (the split is redone); refused once voided. */
export async function updateMaintenanceExpense(_ctx: OwnerContext, expenseId: string, body: unknown): Promise<void> {
  requireId(expenseId, "Expense");
  const input = parseInput(updateMaintenanceSchema, body);
  await (await ownerDb()).maintenance.update(expenseId, fieldsOf(input), input.unitCodes);
}

/** Keeps the expense but leaves it out of every total. */
export async function voidMaintenanceExpense(_ctx: OwnerContext, expenseId: string, body: unknown): Promise<void> {
  requireId(expenseId, "Expense");
  const { reason } = parseInput(voidMaintenanceSchema, body);
  await (await ownerDb()).maintenance.void(expenseId, reason);
}

/** Replaces who paid (the Maintenance page and the expense's page). */
export async function setMaintenanceTags(_ctx: OwnerContext, expenseId: string, body: unknown): Promise<{ tags: string[] }> {
  requireId(expenseId, "Expense");
  const { tags } = parseInput(setPaymentTagsSchema, body);
  const db = await ownerDb();
  await checkNewTags(db, tags);
  const saved = await db.maintenance.setTags(expenseId, tags);
  if (!saved) notFound("Expense");
  return { tags: saved };
}

/** Adds receipts or photos to an expense. */
export async function addMaintenanceFiles(_ctx: OwnerContext, expenseId: string, files: UploadedFile[]): Promise<MaintenanceFilesSaved> {
  if (files.length === 0) throw new ApiError(400, "Choose at least one file");
  checkProofFiles(files, "receipts", MAINTENANCE_FILE_LIMITS);
  const db = await ownerDb();
  await requireExpense(db, expenseId);
  const rows = await storeExpenseFiles(expenseId, files);
  await withUploadedFile(
    rows.map((r) => r.storage_path),
    () => db.maintenance.addFiles(rows)
  );
  return { files: (await requireExpense(db, expenseId)).files.map(fileView) };
}

async function fileOf(db: OwnerRepositories, expenseId: string, fileId: string): Promise<MaintenanceFile> {
  requireId(expenseId, "Expense");
  requireId(fileId, "File");
  const file = await db.maintenance.getFile(fileId);
  if (!file || file.expense_id !== expenseId) notFound("File");
  return file;
}

/** Short-lived URL to view or download one file. */
export async function maintenanceFileUrl(_ctx: OwnerContext, expenseId: string, fileId: string): Promise<string> {
  const file = await fileOf(await ownerDb(), expenseId, fileId);
  return storage.signedUrl(file.storage_path, SIGNED_URL_SECONDS);
}

/** Deletes the row, then (best effort) the file. */
export async function deleteMaintenanceFile(_ctx: OwnerContext, expenseId: string, fileId: string): Promise<void> {
  const db = await ownerDb();
  const file = await fileOf(db, expenseId, fileId);
  if (!(await db.maintenance.removeFile(file.id))) notFound("File");
  await storage.remove([file.storage_path]);
}

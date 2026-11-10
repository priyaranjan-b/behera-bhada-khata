import "server-only";
import type { HouseRent, OwnerRepositories } from "@/server/ports";
import { inScope, type Db, type JwtClaims, type Tx } from "../client";
import { must, mustWrite } from "../errors";
import { createAdjustment, createPayment } from "../procedures/ledger";
import { createMaintenanceExpense, updateMaintenanceExpense, voidMaintenanceExpense } from "../procedures/maintenance";
import { logEvent } from "../procedures/system";
import {
  correctPaidThrough,
  correctRent,
  createTenant,
  moveOutTenant,
  startRentTracking,
  stopRentTracking,
  updateTenant,
} from "../procedures/tenants";
import { listAudit } from "../tables/audit";
import { auditHistoryPage } from "../queries/auditHistoryPage";
import { billingPage, billingTotals } from "../queries/billingPage";
import { maintenancePage } from "../queries/maintenancePage";
import { paymentsPage } from "../queries/paymentsPage";
import { tenantAccountSummary } from "../queries/tenantAccountSummary";
import { tenantLedgerPage } from "../queries/tenantLedgerPage";
import { tenantMonthsPage } from "../queries/tenantMonthsPage";
import {
  getAdjustment,
  getPayment,
  getPaymentProof,
  listAdjustmentAllocations,
  listAdjustments,
  listAllocationsForPeriods,
  listPaymentAllocations,
  listPaymentProofs,
  listPayments,
  listRentPeriods,
  listRentPeriodsByIds,
  rotateToken,
} from "../tables/ledger";
import {
  createTenantDocuments,
  getTenantDocument,
  listTenantDocuments,
  removeTenantDocument,
  tenantIdsWithDocuments,
} from "../tables/documents";
import {
  createPaymentNotePreset,
  getOwnerProfile,
  listPaymentNotePresets,
  removePaymentNotePreset,
  saveOwnerProfile,
  updatePaymentNotePreset,
} from "../tables/owner";
import {
  addMaintenanceFiles,
  getMaintenanceExpense,
  getMaintenanceFile,
  maintenanceMonthly,
  removeMaintenanceFile,
} from "../tables/maintenance";
import {
  createPaymentTag,
  listPaymentTags,
  removePaymentTag,
  setPaymentTags,
  setRecordTags,
  updatePaymentTag,
} from "../tables/paymentTags";
import {
  createProperty,
  createUnit,
  getProperty,
  listLocations,
  listOccupancy,
  listProperties,
  listUnits,
  setHouseRents,
} from "../tables/places";
import { getTenant, listRentRates, listTenants } from "../tables/tenants";

/**
 * A paged read's query for its error label, enough to reproduce it: range,
 * page, sort and how many filters, and whether there was a search but never
 * its text (it can hold names or phone numbers).
 */
function pageLabel(f: {
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: string;
  filters: unknown[];
  search?: string;
}): string {
  const range = f.from || f.to ? `${f.from ?? ""}..${f.to ?? ""} ` : "";
  return `${range}page ${f.page}x${f.pageSize} by ${f.sort} ${f.dir}, ${f.filters.length} filters${f.search ? ", searched" : ""}`;
}

/** The houses in a house-rent write, for its error label (codes only, never amounts). */
function houseCodes(rents: HouseRent[]): string {
  return rents.length ? rents.map((r) => r.unit_code).join(",") : "none";
}

/**
 * A tenant write, then the houses' rents it set (D39), in the same
 * transaction: if either fails, neither is kept.
 */
async function withHouseRents<T>(tx: Tx, rents: HouseRent[], write: () => Promise<T>): Promise<T> {
  const result = await write();
  await setHouseRents(tx, rents);
  return result;
}

/**
 * The owner's repositories on Drizzle (A19): every method. Each query runs
 * through inScope(db, { role: "authenticated", claims }), so RLS and the SQL
 * functions' is_app_owner() still refuse anyone but the single app owner.
 */
export function drizzleOwnerRepositories(db: Db, claims: JwtClaims): OwnerRepositories {
  /** A read as the owner; a failure is a 500 naming `what`, like the old Supabase adapter's `must`. */
  const read = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    must(inScope(db, { role: "authenticated", claims }, fn), what);
  /** A write as the owner; a constraint or policy violation is the user's mistake (writeError), anything else a 500. */
  const write = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    mustWrite(inScope(db, { role: "authenticated", claims }, fn), what);

  return {
    audit: {
      list: (filter) => read(`list audit log${filter.tenantId ? ` of tenant ${filter.tenantId}` : ""}`, (tx) => listAudit(tx, filter)),
      // An app event, by the owner (the session is the actor).
      log: (event) =>
        write(`log event ${event.action}${event.tenantId ? ` for tenant ${event.tenantId}` : ""}`, (tx) => logEvent(tx, event)),
      historyPage: (filter) =>
        read(
          `read history page of ${filter.tenantId !== undefined ? `tenant ${filter.tenantId}` : "all tenants"} ${pageLabel({ ...filter, from: filter.fromDate, to: filter.toDate })}${filter.actions ? `, ${filter.actions.length} actions` : ""}`,
          (tx) => auditHistoryPage(tx, filter)
        ),
    },
    ownerProfile: {
      get: () => read("get owner profile", getOwnerProfile),
      save: (profile) => write("save owner profile", (tx) => saveOwnerProfile(tx, profile)),
    },
    paymentNotePresets: {
      list: () => read("list payment note presets", listPaymentNotePresets),
      create: (text) => write("add payment note preset", (tx) => createPaymentNotePreset(tx, text)),
      update: (id, text) => write(`edit payment note preset ${id}`, (tx) => updatePaymentNotePreset(tx, id, text)),
      remove: (id) => write(`delete payment note preset ${id}`, (tx) => removePaymentNotePreset(tx, id)),
    },
    paymentTags: {
      list: () => read("list payment tags", listPaymentTags),
      create: (name) => write("add payment tag", (tx) => createPaymentTag(tx, name)),
      update: (id, name) => write(`rename payment tag ${id}`, (tx) => updatePaymentTag(tx, id, name)),
      remove: (id) => write(`delete payment tag ${id}`, (tx) => removePaymentTag(tx, id)),
    },
    maintenance: {
      monthly: (fromMonth, toMonth) =>
        read(`read maintenance per month ${fromMonth}..${toMonth}`, (tx) => maintenanceMonthly(tx, fromMonth, toMonth)),
      page: (filter) => read(`read maintenance page ${pageLabel(filter)}`, (tx) => maintenancePage(tx, filter)),
      get: (id) => read(`get maintenance expense ${id}`, (tx) => getMaintenanceExpense(tx, id)),
      create: (id, fields, unitCodes, tags, files, settledByPaymentId) =>
        write(
          `record maintenance expense ${id} on ${unitCodes.length} houses${settledByPaymentId ? ` settled by ${settledByPaymentId}` : ""}`,
          (tx) => createMaintenanceExpense(tx, id, fields, unitCodes, tags, files, settledByPaymentId ?? null)
        ),
      update: (id, fields, unitCodes) =>
        write(`edit maintenance expense ${id}`, (tx) => updateMaintenanceExpense(tx, id, fields, unitCodes)),
      void: (id, reason) => write(`void maintenance expense ${id}`, (tx) => voidMaintenanceExpense(tx, id, reason)),
      setTags: (id, names) => write(`set tags of maintenance expense ${id}`, (tx) => setRecordTags(tx, "maintenance", id, names)),
      addFiles: (rows) => write(`add ${rows.length} maintenance files`, (tx) => addMaintenanceFiles(tx, rows)),
      getFile: (fileId) => read(`get maintenance file ${fileId}`, (tx) => getMaintenanceFile(tx, fileId)),
      removeFile: (fileId) => write(`delete maintenance file ${fileId}`, (tx) => removeMaintenanceFile(tx, fileId)),
    },
    locations: {
      list: () => read("list locations", listLocations),
    },
    properties: {
      list: () => read("list properties", listProperties),
      get: (code) => read(`get property ${code}`, (tx) => getProperty(tx, code)),
      create: (input) => write(`create property ${input.property_code}`, (tx) => createProperty(tx, input)),
    },
    units: {
      list: (filter) => read("list units", (tx) => listUnits(tx, filter)),
      create: (input) => write(`create unit ${input.unit_code}`, (tx) => createUnit(tx, input)),
      setRents: (rents) => write(`set rent of houses ${houseCodes(rents)}`, (tx) => setHouseRents(tx, rents)),
    },
    occupancy: {
      list: (filter) =>
        read(filter?.tenantIds ? `list occupancy of ${filter.tenantIds.length} tenants` : "list occupancy", (tx) =>
          listOccupancy(tx, filter)
        ),
    },
    tenantDocuments: {
      list: (tenantId) => read(`list documents of tenant ${tenantId}`, (tx) => listTenantDocuments(tx, tenantId)),
      tenantIdsWithDocuments: () => read("list tenants with documents", tenantIdsWithDocuments),
      get: (id) => read(`get tenant document ${id}`, (tx) => getTenantDocument(tx, id)),
      create: (rows) =>
        write(`add ${rows.length} documents for tenant ${rows[0]?.tenant_id ?? "-"}`, (tx) => createTenantDocuments(tx, rows)),
      remove: (id) => write(`delete tenant document ${id}`, (tx) => removeTenantDocument(tx, id)),
    },
    rentRates: {
      listForTenants: (ids) => read(`list rent rates of ${ids.length} tenants`, (tx) => listRentRates(tx, ids)),
    },
    tenants: {
      accountSummary: (id) => read(`read tenant account ${id}`, (tx) => tenantAccountSummary(tx, id)),
      list: (filter) => read("list tenants", (tx) => listTenants(tx, filter)),
      get: (id) => read(`get tenant ${id}`, (tx) => getTenant(tx, id)),
      create: (input, houseRents = []) =>
        write(`create tenant, house rents ${houseCodes(houseRents)}`, (tx) =>
          withHouseRents(tx, houseRents, () => createTenant(tx, input))
        ),
      update: (id, changes, houseRents = []) =>
        write(`update tenant ${id}, house rents ${houseCodes(houseRents)}`, (tx) =>
          withHouseRents(tx, houseRents, () => updateTenant(tx, id, changes))
        ),
      moveOut: (id, date) => write(`move out tenant ${id}`, (tx) => moveOutTenant(tx, id, date)),
      correctPaidThrough: (id, paidThrough) =>
        write(`correct paid up to of tenant ${id}`, (tx) => correctPaidThrough(tx, id, paidThrough)),
      correctRent: (id, fromMonth, monthlyRent, houseRents = []) =>
        write(`correct rent of tenant ${id} from ${fromMonth}, house rents ${houseCodes(houseRents)}`, (tx) =>
          withHouseRents(tx, houseRents, () => correctRent(tx, id, fromMonth, monthlyRent))
        ),
      startRentTracking: (id, monthlyRent, paidThrough, houseRents = []) =>
        write(`start rent tracking of tenant ${id}, house rents ${houseCodes(houseRents)}`, (tx) =>
          withHouseRents(tx, houseRents, () => startRentTracking(tx, id, monthlyRent, paidThrough))
        ),
      stopRentTracking: (id) => write(`stop rent tracking of tenant ${id}`, (tx) => stopRentTracking(tx, id)),
    },
    billing: {
      page: (filter) => read(`read billing page ${pageLabel(filter)} show ${filter.show}`, (tx) => billingPage(tx, filter)),
      totals: (range) => read(`read billing totals ${range.from}..${range.to}`, (tx) => billingTotals(tx, range)),
    },
    ledger: {
      page: (filter) =>
        read(
          `read ledger page of tenant ${filter.tenantId} ${pageLabel({ ...filter, from: filter.fromDate, to: filter.toDate })}`,
          (tx) => tenantLedgerPage(tx, filter)
        ),
    },
    rentPeriods: {
      listForTenants: (ids, filter) => read(`list rent periods of ${ids.length} tenants`, (tx) => listRentPeriods(tx, ids, filter)),
      listByIds: (ids) => read(`list ${ids.length} rent periods`, (tx) => listRentPeriodsByIds(tx, ids)),
      page: (filter) =>
        read(`read months page of tenant ${filter.tenantId} ${pageLabel(filter)} show ${filter.show}`, (tx) =>
          tenantMonthsPage(tx, filter)
        ),
    },
    payments: {
      listForTenants: (ids, filter) => read(`list payments of ${ids.length} tenants`, (tx) => listPayments(tx, ids, filter)),
      get: (id) => read(`get payment ${id}`, (tx) => getPayment(tx, id)),
      listAllocations: (id) => read(`list allocations of payment ${id}`, (tx) => listPaymentAllocations(tx, id)),
      listAllocationsForPeriods: (ids) =>
        read(`list allocations for ${ids.length} months`, (tx) => listAllocationsForPeriods(tx, ids)),
      listProofs: (ids) => read(`list proofs of ${ids.length} payments`, (tx) => listPaymentProofs(tx, ids)),
      getProof: (id) => read(`get payment proof ${id}`, (tx) => getPaymentProof(tx, id)),
      page: (filter) => read(`read payments page ${pageLabel(filter)}`, (tx) => paymentsPage(tx, filter)),
      create: (payment, allocations, proofs, tags) =>
        write(`create payment ${payment.id} for tenant ${payment.tenant_id}`, (tx) =>
          createPayment(tx, payment, allocations, proofs, tags)
        ),
      setTags: (id, names) => write(`set tags of payment ${id}`, (tx) => setPaymentTags(tx, id, names)),
      rotateToken: (id, tokenHash, expiresAt) =>
        write(`rotate payment link ${id}`, (tx) => rotateToken(tx, "payment", id, tokenHash, expiresAt)),
    },
    adjustments: {
      listForTenants: (ids, filter) => read(`list adjustments of ${ids.length} tenants`, (tx) => listAdjustments(tx, ids, filter)),
      get: (id) => read(`get adjustment ${id}`, (tx) => getAdjustment(tx, id)),
      listAllocations: (id) => read(`list allocations of adjustment ${id}`, (tx) => listAdjustmentAllocations(tx, id)),
      create: (adjustment, allocations) =>
        write(`create adjustment ${adjustment.id} on payment ${adjustment.original_payment_id}`, (tx) =>
          createAdjustment(tx, adjustment, allocations)
        ),
      rotateToken: (id, tokenHash, expiresAt) =>
        write(`rotate adjustment link ${id}`, (tx) => rotateToken(tx, "adjustment", id, tokenHash, expiresAt)),
    },
  };
}

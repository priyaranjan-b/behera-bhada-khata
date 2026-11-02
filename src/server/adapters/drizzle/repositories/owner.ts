import "server-only";
import type { OwnerRepositories } from "@/server/ports";
import { inScope, type Db, type JwtClaims, type Tx } from "../client";
import { must, mustWrite } from "../errors";
import { auditHistoryPage } from "../queries/auditHistoryPage";
import { billingPage, billingTotals } from "../queries/billingPage";
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
import { createProperty, createUnit, getProperty, listLocations, listOccupancy, listProperties, listUnits } from "../tables/places";
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

/** Some methods of some namespaces: what the Drizzle adapter implements so far. */
export type RepositoryOverrides<R> = { [K in keyof R]?: Partial<R[K]> };

/**
 * The owner's repositories that have moved to Drizzle (A19). Every query
 * runs through inScope(db, { role: "authenticated", claims }), so RLS still
 * refuses anyone but the single app owner. Namespaces not listed here stay
 * on the Supabase adapter (see src/server/infra/index.ts).
 */
export function drizzleOwnerRepositories(db: Db, claims: JwtClaims): RepositoryOverrides<OwnerRepositories> {
  /** A read as the owner; a failure is a 500 naming `what`, like the Supabase adapter's `must`. */
  const read = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    must(inScope(db, { role: "authenticated", claims }, fn), what);
  /** A write as the owner; a constraint or policy violation is the user's mistake (writeError), anything else a 500. */
  const write = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    mustWrite(inScope(db, { role: "authenticated", claims }, fn), what);

  return {
    audit: {
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
    },
    adjustments: {
      listForTenants: (ids, filter) => read(`list adjustments of ${ids.length} tenants`, (tx) => listAdjustments(tx, ids, filter)),
      get: (id) => read(`get adjustment ${id}`, (tx) => getAdjustment(tx, id)),
      listAllocations: (id) => read(`list allocations of adjustment ${id}`, (tx) => listAdjustmentAllocations(tx, id)),
    },
  };
}

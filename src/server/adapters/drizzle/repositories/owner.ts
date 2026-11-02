import "server-only";
import type { OwnerRepositories } from "@/server/ports";
import { inScope, type Db, type JwtClaims, type Tx } from "../client";
import { must } from "../errors";
import { billingPage, billingTotals } from "../queries/billingPage";
import { paymentsPage } from "../queries/paymentsPage";
import { tenantAccountSummary } from "../queries/tenantAccountSummary";
import { tenantLedgerPage } from "../queries/tenantLedgerPage";
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
import { getOwnerProfile, listPaymentNotePresets } from "../tables/owner";
import { getProperty, listLocations, listOccupancy, listProperties, listUnits } from "../tables/places";
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

  return {
    ownerProfile: {
      get: () => read("get owner profile", getOwnerProfile),
    },
    paymentNotePresets: {
      list: () => read("list payment note presets", listPaymentNotePresets),
    },
    locations: {
      list: () => read("list locations", listLocations),
    },
    properties: {
      list: () => read("list properties", listProperties),
      get: (code) => read(`get property ${code}`, (tx) => getProperty(tx, code)),
    },
    units: {
      list: (filter) => read("list units", (tx) => listUnits(tx, filter)),
    },
    occupancy: {
      list: (filter) =>
        read(filter?.tenantIds ? `list occupancy of ${filter.tenantIds.length} tenants` : "list occupancy", (tx) =>
          listOccupancy(tx, filter)
        ),
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

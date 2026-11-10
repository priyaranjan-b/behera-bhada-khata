import "server-only";
import { asc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { TenantDocument, TenantRentRate } from "@/lib/types";
import type { TenantRepositories } from "@/server/ports";
import { inScope, type Db, type Tx } from "../client";
import { must } from "../errors";
import { tenantAccountSummary } from "../queries/tenantAccountSummary";
import { tenantLedgerPage } from "../queries/tenantLedgerPage";
import { tenantMonthsPage } from "../queries/tenantMonthsPage";
import { getPaymentProof, listPaymentProofs, recordExists } from "../tables/ledger";
import { listOccupancy, listProperties, listUnits } from "../tables/places";
import { getTenant } from "../tables/tenants";
import { tenantDocuments, tenantRentRates } from "../schema";

// tenant_reader may not read `recorded_by` (the owner's account id, 0034), so
// these two tables are read column by column; the rows say null for it.
const { recorded_by: _docBy, ...DOCUMENT_COLUMNS } = getTableColumns(tenantDocuments);
const { recorded_by: _rateBy, ...RATE_COLUMNS } = getTableColumns(tenantRentRates);

async function listDocuments(tx: Tx, tenantId: string): Promise<TenantDocument[]> {
  const rows = await tx
    .select(DOCUMENT_COLUMNS)
    .from(tenantDocuments)
    .where(eq(tenantDocuments.tenant_id, tenantId))
    .orderBy(asc(tenantDocuments.created_at), asc(tenantDocuments.storage_path));
  return rows.map((r) => ({ ...r, recorded_by: null }));
}

async function getDocument(tx: Tx, id: string): Promise<TenantDocument | null> {
  const [row] = await tx.select(DOCUMENT_COLUMNS).from(tenantDocuments).where(eq(tenantDocuments.id, id));
  return row ? { ...row, recorded_by: null } : null;
}

async function listRates(tx: Tx, tenantIds: string[]): Promise<TenantRentRate[]> {
  if (tenantIds.length === 0) return [];
  const rows = await tx
    .select(RATE_COLUMNS)
    .from(tenantRentRates)
    .where(inArray(tenantRentRates.tenant_id, tenantIds))
    .orderBy(asc(tenantRentRates.effective_month), asc(tenantRentRates.id));
  return rows.map((r) => ({ ...r, recorded_by: null }));
}

/**
 * A signed-in tenant's repositories on Drizzle (0033, A32): reads only, each
 * run as tenant_reader for `tenantId` (from the verified tenant session).
 * RLS shows that tenant's rows and nothing else, whatever id a method is
 * passed; the role can't write. The same queries as the owner's tenant page.
 */
export function drizzleTenantRepositories(db: Db, tenantId: string): TenantRepositories {
  const read = <T>(what: string, fn: (tx: Tx) => Promise<T>) =>
    must(inScope(db, { role: "tenant_reader", tenantId }, fn), `tenant portal: ${what}`);

  return {
    tenants: {
      get: (id) => read(`get tenant ${id}`, (tx) => getTenant(tx, id)),
      accountSummary: (id) => read(`read tenant account ${id}`, (tx) => tenantAccountSummary(tx, id)),
    },
    rentPeriods: {
      page: (filter) => read(`read months page of tenant ${filter.tenantId}`, (tx) => tenantMonthsPage(tx, filter)),
    },
    ledger: {
      page: (filter) => read(`read ledger page of tenant ${filter.tenantId}`, (tx) => tenantLedgerPage(tx, filter)),
    },
    payments: {
      listProofs: (ids) => read(`list proofs of ${ids.length} payments`, (tx) => listPaymentProofs(tx, ids)),
      getProof: (id) => read(`get payment proof ${id}`, (tx) => getPaymentProof(tx, id)),
    },
    occupancy: {
      list: (filter) => read("list occupancy", (tx) => listOccupancy(tx, filter)),
    },
    rentRates: {
      listForTenants: (ids) => read(`list rent rates of ${ids.length} tenants`, (tx) => listRates(tx, ids)),
    },
    properties: {
      list: () => read("list properties", listProperties),
    },
    units: {
      list: (filter) => read("list units", (tx) => listUnits(tx, filter, { withoutRent: true })),
    },
    tenantDocuments: {
      list: (id) => read(`list documents of tenant ${id}`, (tx) => listDocuments(tx, id)),
      get: (id) => read(`get tenant document ${id}`, (tx) => getDocument(tx, id)),
    },
    records: {
      exists: (kind, id) => read(`find ${kind} ${id}`, (tx) => recordExists(tx, kind, id)),
    },
  };
}

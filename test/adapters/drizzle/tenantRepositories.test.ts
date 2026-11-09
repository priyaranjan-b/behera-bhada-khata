// The tenant portal's repositories (0033, A32) on a real Postgres: every read
// the portal makes works as tenant_reader, shows that tenant's rows only and
// matches what the owner sees for them.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import { drizzleTenantRepositories } from "@/server/adapters/drizzle/repositories/tenant";
import type { TenantLedgerFilter, TenantMonthsFilter } from "@/server/ports";
import { asOwner, asService, createLedgerDb, OWNER, type LedgerDb } from "./fixtures";

let l: LedgerDb;
let asha: string;
let bimal: string;
let ashaPayment: string;
let bimalPayment: string;
let ashaAdjustment: string;
let bimalAdjustment: string;
let ashaProof: string;
let bimalProof: string;
let ashaDocument: string;
let bimalDocument: string;

const grid = { search: undefined, filters: [], logic: "and" as const, dir: "desc" as const, page: 0, pageSize: 50 };
const ledgerOf = (tenantId: string): TenantLedgerFilter => ({ ...grid, tenantId, sort: "date" });
const monthsOf = (tenantId: string): TenantMonthsFilter => ({ ...grid, tenantId, sort: "period_month", show: "all" });

beforeAll(async () => {
  l = await createLedgerDb();
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
  bimal = await l.createTenant({ name: "Bimal", rent: 4000, leaseStart: "2026-01-01", units: ["AC-T1-G02"] });
  await l.bill([asha, bimal], "2026-03-01");
  await l.pay(asha, [{ rent_period_id: (await l.months(asha))[0].id, amount: 5000 }]);
  await l.pay(bimal, [{ rent_period_id: (await l.months(bimal))[0].id, amount: 4000 }]);
  const ids = await l.rows<{ id: string; tenant_id: string }>({ role: "service_role" }, sql`select id, tenant_id from payments`);
  ashaPayment = ids.find((r) => r.tenant_id === asha)!.id;
  bimalPayment = ids.find((r) => r.tenant_id === bimal)!.id;

  // A correction on each payment, a proof and a document for each tenant.
  for (const [tenantId, paymentId] of [
    [asha, ashaPayment],
    [bimal, bimalPayment],
  ]) {
    const period = (await l.months(tenantId))[0].id;
    await l.rows(
      asOwner,
      sql`select create_adjustment(gen_random_uuid(), ${paymentId}::uuid, -100, 'Recorded too much', 'sig.png',
            md5(random()::text), now() + interval '14 days', ${JSON.stringify([{ rent_period_id: period, amount: -100 }])}::jsonb)`
    );
    await l.rows(
      asService,
      sql`insert into payment_proofs (payment_id, storage_path, file_name, content_type, size_bytes)
          values (${paymentId}::uuid, ${`payments/${tenantId}/${paymentId}/proofs/a.png`}, 'a.png', 'image/png', 1);
          `
    );
    await l.rows(
      asService,
      sql`insert into tenant_documents (tenant_id, document_type, storage_path, file_name, content_type, size_bytes)
          values (${tenantId}::uuid, 'Agreement', ${`tenants/${tenantId}/documents/a.pdf`}, 'a.pdf', 'application/pdf', 1)`
    );
  }
  const of = async <T extends { tenant_id: string; id: string }>(query: ReturnType<typeof sql>) => {
    const rows = await l.rows<T>(asService, query);
    return [rows.find((r) => r.tenant_id === asha)!.id, rows.find((r) => r.tenant_id === bimal)!.id];
  };
  [ashaAdjustment, bimalAdjustment] = await of(sql`select id, tenant_id from adjustments`);
  [ashaProof, bimalProof] = await of(
    sql`select pp.id, p.tenant_id from payment_proofs pp join payments p on p.id = pp.payment_id`
  );
  [ashaDocument, bimalDocument] = await of(sql`select id, tenant_id from tenant_documents`);
});

afterAll(async () => {
  await l?.close();
});

describe("drizzleTenantRepositories", () => {
  it("reads the tenant's own account, ledger and months exactly as the owner sees them", async () => {
    const mine = drizzleTenantRepositories(l.db, asha);
    const owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
    expect(await mine.tenants.get(asha)).toEqual(await owner.tenants.get(asha));
    expect(await mine.tenants.accountSummary(asha)).toEqual(await owner.tenants.accountSummary(asha));
    const ledger = await mine.ledger.page(ledgerOf(asha));
    const ownerLedger = await owner.ledger.page(ledgerOf(asha));
    // Same rows and balance; the owner's tags are the one thing a tenant doesn't get.
    expect(ledger.rows.map(({ tags: _t, ...r }) => r)).toEqual(ownerLedger.rows.map(({ tags: _t, ...r }) => r));
    expect(await mine.rentPeriods.page(monthsOf(asha))).toEqual(await owner.rentPeriods.page(monthsOf(asha)));
    expect((await mine.occupancy.list({ tenantIds: [asha] })).map((o) => o.unit_code)).toEqual(["AC-T1-G01"]);
    expect((await mine.properties.list()).map((p) => p.property_code)).toEqual(["AC-T1"]);
    expect((await mine.units.list()).map((u) => u.unit_code)).toEqual(["AC-T1-G01"]);
    expect(await mine.records.exists("payment", ashaPayment)).toBe(true);
    expect(await mine.records.exists("adjustment", ashaAdjustment)).toBe(true);
    expect(ledger.rows.some((r) => r.type === "adjustment")).toBe(true);
    expect((await mine.payments.listProofs([ashaPayment])).map((p) => p.id)).toEqual([ashaProof]);
    expect((await mine.payments.getProof(ashaProof))?.payment_id).toBe(ashaPayment);
    // Documents and rent rates, without the owner's account id (0034).
    const docs = await mine.tenantDocuments.list(asha);
    expect(docs.map((d) => d.id)).toEqual([ashaDocument]);
    expect(docs[0].recorded_by).toBeNull();
    expect((await mine.tenantDocuments.get(ashaDocument))?.file_name).toBe("a.pdf");
    const rates = await mine.rentRates.listForTenants([asha]);
    expect(rates.map((r) => Number(r.monthly_amount))).toEqual([5000]);
    expect(rates[0].recorded_by).toBeNull();
  });

  it("shows nothing of another tenant, whatever id it is asked for", async () => {
    const mine = drizzleTenantRepositories(l.db, asha);
    expect(await mine.tenants.get(bimal)).toBeNull();
    expect((await mine.ledger.page(ledgerOf(bimal))).rows).toEqual([]);
    expect((await mine.rentPeriods.page(monthsOf(bimal))).rows).toEqual([]);
    expect(await mine.occupancy.list({ tenantIds: [bimal] })).toEqual([]);
    expect(await mine.records.exists("payment", bimalPayment)).toBe(false);
    expect(await mine.records.exists("adjustment", bimalAdjustment)).toBe(false);
    expect(await mine.payments.listProofs([bimalPayment])).toEqual([]);
    expect(await mine.payments.getProof(bimalProof)).toBeNull();
    expect(await mine.tenantDocuments.get(bimalDocument)).toBeNull();
    expect(await mine.tenantDocuments.list(bimal)).toEqual([]);
    expect(await mine.rentRates.listForTenants([bimal])).toEqual([]);
  });
});

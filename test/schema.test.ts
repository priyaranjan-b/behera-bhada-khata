// Runs every migration in supabase/migrations against a real Postgres
// (PGlite, in-process) with stand-ins for the bits of Supabase they rely on
// (auth.uid(), the anon/authenticated/service_role roles and their default
// grants, storage.buckets), then exercises the ledger functions the way the
// app calls them: create_* as the signed-in owner under RLS, confirm_* and
// friends as the service role.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMonthsToKey, currentMonthKey, formatDateKey, formatDateTime, formatMonth } from "@/lib/dates";
import { monthsIn, paidDirectMonths } from "@/lib/domain/billing";
import { summarizeBalance } from "@/lib/domain/allocation";
import { auditActionLabel } from "@/lib/domain/audit";
import { PAYMENT_MODE_LABELS } from "@/lib/domain/payments";
import {
  PREFERRED_CHANNEL_LABELS,
  TENANT_KIND_LABELS,
  TENANT_STATUS_DISPLAY,
  UNIT_TYPE_LABELS,
  formatFloor,
} from "@/lib/domain/tenant";
import { formatMoney } from "@/lib/money";
import { AUDIT_ACTIONS } from "@/lib/types";

const MIGRATIONS = path.resolve(__dirname, "../supabase/migrations");
const SEED = path.resolve(__dirname, "../supabase/seed/arnapal_master_data.sql");
const TENANT_SEED = path.resolve(__dirname, "../supabase/seed/arnapal_tenants.sql");

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants everything in public to these roles by default; the
  -- migrations then revoke what they must.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
`;

/** The app owner (registered in app_owner). */
const OWNER_A = "00000000-0000-4000-8000-00000000000a";
/** Another signed-in account: must see and change nothing. */
const OWNER_B = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;

type Role = { role: "authenticated"; sub: string } | { role: "service_role" };

/** Runs `sql` as an app-facing role (RLS and grants apply), returning rows. */
async function as<T = Record<string, unknown>>(who: Role, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who.role === "authenticated" ? who.sub : ""]);
  await db.exec(`set role ${who.role}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

const owner = (sub: string): Role => ({ role: "authenticated", sub });
const service: Role = { role: "service_role" };

/** The SQLSTATE a statement fails with (or "ok"). */
async function errorCode(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "ok";
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
}

interface Fixture {
  tenantA: string;
  tenantA2: string;
  periods: { id: string; period_month: string }[];
  otherTenantPeriod: string;
}

let fx: Fixture;

/** Onboards a tenant through create_tenant, as the owner. */
async function createTenant(
  sub: string,
  t: { name: string; rent: number; leaseStart: string; units: string[]; phone?: string }
): Promise<string> {
  const [row] = await as<{ id: string }>(
    owner(sub),
    `select create_tenant($1, null, $2, 'both', $3, $4, $5::text[]) as id`,
    [t.name, t.phone ?? "+919876543210", t.rent, t.leaseStart, t.units]
  );
  return row.id;
}

async function periodsOf(tenantId: string): Promise<{ period_month: string; amount_due: number }[]> {
  const { rows } = await db.query<{ period_month: string; amount_due: string }>(
    `select to_char(period_month, 'YYYY-MM-DD') as period_month, amount_due from rent_periods
     where tenant_id = $1 order by period_month`,
    [tenantId]
  );
  return rows.map((r) => ({ period_month: r.period_month, amount_due: Number(r.amount_due) }));
}

async function tenancies(unitCode: string): Promise<{ tenant_id: string; start_date: string; end_date: string | null }[]> {
  const { rows } = await db.query<{ tenant_id: string; start_date: string; end_date: string | null }>(
    `select tenant_id, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
     from unit_occupancy where unit_code = $1 order by start_date`,
    [unitCode]
  );
  return rows;
}

function createPayment(as_: Role, args: { tenant?: string; amount: number; allocations: unknown[] }) {
  return as(
    as_,
    `select create_payment(gen_random_uuid(), $1, $2, '2026-03-05', 'cash', null, 'sig.png',
       md5(random()::text), now() + interval '14 days', $3::jsonb)`,
    [args.tenant ?? fx.tenantA, args.amount, JSON.stringify(args.allocations)]
  );
}

async function latestPaymentId(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from payments order by created_at desc, id limit 1`);
  return rows[0].id;
}

/** The tenant's optional signature + OTP (0010): never moves money. */
function acknowledge(kind: "payment" | "adjustment", id: string) {
  return as<{ ok: boolean }>(
    service,
    `select acknowledge_${kind}($1, 'tenant.png', 'receipt.pdf', now()) as ok`,
    [id]
  );
}

async function allocated(periodId: string): Promise<number> {
  const { rows } = await db.query<{ amount_allocated: string }>(
    `select amount_allocated from rent_periods where id = $1`,
    [periodId]
  );
  return Number(rows[0].amount_allocated);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate adjustment_allocations, adjustments, payment_allocations, payments, receipt_counters, rent_periods,
      tenant_units, tenant_rent_rates, tenants, units, properties, locations, rate_limits, app_owner, auth.users,
      audit_log cascade;
    insert into auth.users (id, email) values ('${OWNER_A}', 'a@example.com'), ('${OWNER_B}', 'b@example.com');
    insert into app_owner (user_id) values ('${OWNER_A}');

    insert into locations (location_code, name) values ('AC', 'Arnapal Chakk Complex');
    insert into properties (property_code, location_code, name) values ('AC-T1', 'AC', 'Tower 1');
    insert into units (unit_code, property_code, floor, unit_type)
      select 'AC-T1-G0' || n, 'AC-T1', 'G', 'commercial' from generate_series(1, 6) as n;
  `);
  const tenants = [
    { id: await createTenant(OWNER_A, { name: "Asha", rent: 5000, leaseStart: "2026-01-15", units: ["AC-T1-G01"] }) },
    {
      id: await createTenant(OWNER_A, {
        name: "Bimal",
        rent: 4000,
        leaseStart: "2026-01-01",
        units: ["AC-T1-G02"],
        phone: "+919876543211",
      }),
    },
  ];
  await as(service, `select ensure_rent_periods($1::uuid[], '2026-03-01')`, [[tenants[0].id, tenants[1].id]]);
  const periods = (
    await db.query<{ id: string; period_month: string }>(
      `select id, to_char(period_month, 'YYYY-MM-DD') as period_month from rent_periods where tenant_id = $1 order by period_month`,
      [tenants[0].id]
    )
  ).rows;
  const [other] = (
    await db.query<{ id: string }>(`select id from rent_periods where tenant_id = $1 limit 1`, [tenants[1].id])
  ).rows;
  fx = { tenantA: tenants[0].id, tenantA2: tenants[1].id, periods, otherTenantPeriod: other.id };
});

describe("ensure_rent_periods", () => {
  it("creates one period per month from the lease start's month, idempotently", async () => {
    expect(fx.periods.map((p) => p.period_month)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    const [{ n }] = await as<{ n: number }>(service, `select ensure_rent_periods(null, '2026-04-01') as n`);
    expect(n).toBe(2); // April for both active tenants; Jan-Mar already exist
  });

  it("is not callable by the owner", async () => {
    expect(await errorCode(as(owner(OWNER_A), `select ensure_rent_periods(null, '2026-04-01')`))).toBe("42501");
  });
});

describe("create_payment", () => {
  it("records a confirmed payment and applies it to the months at once (0010)", async () => {
    await createPayment(owner(OWNER_A), {
      amount: 7500,
      allocations: [
        { rent_period_id: fx.periods[0].id, amount: 5000 },
        { rent_period_id: fx.periods[1].id, amount: 2500 },
      ],
    });
    const { rows } = await db.query<{ status: string; n: number; confirmed: boolean; acknowledged: boolean }>(
      `select p.status, (select count(*)::int from payment_allocations a where a.payment_id = p.id) as n,
              p.confirmed_at is not null as confirmed, p.acknowledged_at is not null as acknowledged
       from payments p`
    );
    expect(rows).toEqual([{ status: "confirmed", n: 2, confirmed: true, acknowledged: false }]);
    expect(await allocated(fx.periods[0].id)).toBe(5000);
    expect(await allocated(fx.periods[1].id)).toBe(2500);
  });

  it("can't fill a month twice: a second payment only fits what's left", async () => {
    const full = [{ rent_period_id: fx.periods[0].id, amount: 5000 }];
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: full });
    expect(await errorCode(createPayment(owner(OWNER_A), { amount: 5000, allocations: full }))).toBe("BBK00");
    expect(await allocated(fx.periods[0].id)).toBe(5000);
    expect((await db.query(`select 1 from payments`)).rows).toHaveLength(1);
  });

  it.each([
    ["allocations that don't add up to the amount", 6000, () => [{ rent_period_id: fx.periods[0].id, amount: 5000 }]],
    ["a month of another tenant", 4000, () => [{ rent_period_id: fx.otherTenantPeriod, amount: 4000 }]],
    ["more than is owed for a month", 6000, () => [{ rent_period_id: fx.periods[0].id, amount: 6000 }]],
    ["no allocations", 100, () => []],
    [
      "the same month twice",
      2000,
      () => [
        { rent_period_id: fx.periods[0].id, amount: 1000 },
        { rent_period_id: fx.periods[0].id, amount: 1000 },
      ],
    ],
  ])("rejects %s with BBK00 and writes nothing", async (_label, amount, allocations) => {
    expect(await errorCode(createPayment(owner(OWNER_A), { amount, allocations: allocations() }))).toBe("BBK00");
    const { rows } = await db.query(`select 1 from payments`);
    expect(rows).toHaveLength(0);
  });

  it("refuses anyone who isn't the app owner", async () => {
    const allocations = [{ rent_period_id: fx.periods[0].id, amount: 5000 }];
    expect(await errorCode(createPayment(owner(OWNER_B), { amount: 5000, allocations }))).toBe("BBK04");
  });

  it("leaves no way for the owner to write the ledger except through the functions", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const id = await latestPaymentId();
    expect(await errorCode(as(owner(OWNER_A), `update payments set amount = 1 where id = $1`, [id]))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `select acknowledge_payment($1, 'x', 'y', now())`, [id]))).toBe("42501");
    // Direct inserts would skip every check and the balance update (0010).
    expect(
      await errorCode(
        as(
          owner(OWNER_A),
          `insert into payments (tenant_id, amount, payment_date, mode, token_hash, token_expires_at)
           values ($1, 1, '2026-03-05', 'cash', 'h', now())`,
          [fx.tenantA]
        )
      )
    ).toBe("42501");
    expect(
      await errorCode(
        as(
          owner(OWNER_A),
          `insert into payment_allocations (payment_id, rent_period_id, amount_allocated) values ($1, $2, 1)`,
          [id, fx.periods[1].id]
        )
      )
    ).toBe("42501");
  });
});

describe("payment proofs", () => {
  const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
  const folder = () => `payments/${fx.tenantA}/${PAYMENT_ID}/proofs/`;
  const proof = (overrides: Record<string, unknown> = {}) => ({
    storage_path: `${folder()}1-upi.jpg`,
    file_name: "UPI.jpg",
    content_type: "image/jpeg",
    size_bytes: 1234,
    ...overrides,
  });

  function createWithProofs(as_: Role, proofs: unknown[]) {
    return as(
      as_,
      `select create_payment($1, $2, 5000, '2026-03-05', 'upi', null, 'sig.png',
         md5(random()::text), now() + interval '14 days', $3::jsonb, $4::jsonb)`,
      [PAYMENT_ID, fx.tenantA, JSON.stringify([{ rent_period_id: fx.periods[0].id, amount: 5000 }]), JSON.stringify(proofs)]
    );
  }

  it("stores the proofs with the payment, in the same call", async () => {
    await createWithProofs(owner(OWNER_A), [proof(), proof({ storage_path: `${folder()}2-slip.pdf`, file_name: "slip.pdf", content_type: "application/pdf" })]);
    const rows = await as<{ file_name: string; content_type: string }>(
      owner(OWNER_A),
      `select file_name, content_type from payment_proofs where payment_id = $1 order by storage_path`,
      [PAYMENT_ID]
    );
    expect(rows).toEqual([
      { file_name: "UPI.jpg", content_type: "image/jpeg" },
      { file_name: "slip.pdf", content_type: "application/pdf" },
    ]);
  });

  it("still records a payment without proofs (the 10-argument call)", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const { rows } = await db.query(`select 1 from payment_proofs`);
    expect(rows).toHaveLength(0);
    expect((await db.query(`select 1 from payments`)).rows).toHaveLength(1);
  });

  it.each([
    ["a file outside the payment's folder", () => [proof({ storage_path: `payments/${fx.tenantA}/other/proofs/x.jpg` })]],
    ["the bare folder as a path", () => [proof({ storage_path: folder() })]],
    ["more than 10 files", () => Array.from({ length: 11 }, (_, i) => proof({ storage_path: `${folder()}${i}.jpg` }))],
  ])("rejects %s with BBK00 and writes nothing", async (_label, proofs) => {
    expect(await errorCode(createWithProofs(owner(OWNER_A), proofs()))).toBe("BBK00");
    expect((await db.query(`select 1 from payments`)).rows).toHaveLength(0);
  });

  it("rolls the payment back on a file type the table doesn't accept", async () => {
    expect(await errorCode(createWithProofs(owner(OWNER_A), [proof({ content_type: "text/html" })]))).toBe("23514");
    expect((await db.query(`select 1 from payments`)).rows).toHaveLength(0);
  });

  it("is append-only and hidden from other accounts", async () => {
    await createWithProofs(owner(OWNER_A), [proof()]);
    expect(await errorCode(as(owner(OWNER_A), `update payment_proofs set file_name = 'x'`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `delete from payment_proofs`))).toBe("42501");
    expect(await as(owner(OWNER_B), `select * from payment_proofs`)).toEqual([]);
  });
});

describe("tenant acknowledgement (0010)", () => {
  it("records the signature once and never touches the balance", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const id = await latestPaymentId();

    expect(await acknowledge("payment", id)).toEqual([{ ok: true }]);
    expect(await allocated(fx.periods[0].id)).toBe(5000);
    const { rows } = await db.query<{ tenant_signature_path: string; pdf_path: string; acknowledged: boolean }>(
      `select tenant_signature_path, pdf_path, acknowledged_at is not null as acknowledged from payments where id = $1`,
      [id]
    );
    expect(rows).toEqual([{ tenant_signature_path: "tenant.png", pdf_path: "receipt.pdf", acknowledged: true }]);

    // A second (racing or replayed) acknowledgement changes nothing.
    expect(await acknowledge("payment", id)).toEqual([{ ok: false }]);
  });

  it("stops the owner rotating the link once acknowledged", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const id = await latestPaymentId();
    const rotate = () =>
      as(owner(OWNER_A), `update payments set token_hash = md5(random()::text) where id = $1 returning id`, [id]);
    expect(await rotate()).toHaveLength(1);
    await acknowledge("payment", id);
    expect(await rotate()).toHaveLength(0);
  });

  it("no longer has the old confirm functions (they would apply money twice)", async () => {
    const { rows } = await db.query(`select 1 from pg_proc where proname in ('confirm_payment', 'confirm_adjustment')`);
    expect(rows).toHaveLength(0);
  });
});

describe("adjustments", () => {
  async function confirmedPayment(): Promise<string> {
    await createPayment(owner(OWNER_A), {
      amount: 5000,
      allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }],
    });
    return latestPaymentId();
  }

  function createAdjustment(paymentId: string, delta: number, allocations: unknown[]) {
    return as(
      owner(OWNER_A),
      `select create_adjustment(gen_random_uuid(), $1, $2, 'Recorded too much', 'sig.png',
         md5(random()::text), now() + interval '14 days', $3::jsonb)`,
      [paymentId, delta, JSON.stringify(allocations)]
    );
  }

  it("corrects a payment through its own months, applied at once (0010)", async () => {
    const paymentId = await confirmedPayment();
    await createAdjustment(paymentId, -1000, [{ rent_period_id: fx.periods[0].id, amount: -1000 }]);
    expect(await allocated(fx.periods[0].id)).toBe(4000);
    const [{ id, status }] = (await db.query<{ id: string; status: string }>(`select id, status from adjustments`)).rows;
    expect(status).toBe("confirmed");

    // Acknowledging it is optional and moves nothing.
    expect(await acknowledge("adjustment", id)).toEqual([{ ok: true }]);
    expect(await allocated(fx.periods[0].id)).toBe(4000);
  });

  it("counts earlier corrections when checking what can be taken back", async () => {
    const paymentId = await confirmedPayment();
    await createAdjustment(paymentId, -3000, [{ rent_period_id: fx.periods[0].id, amount: -3000 }]);
    expect(
      await errorCode(createAdjustment(paymentId, -2500, [{ rent_period_id: fx.periods[0].id, amount: -2500 }]))
    ).toBe("BBK00");
    expect(await allocated(fx.periods[0].id)).toBe(2000);
  });

  it("rejects months the payment didn't cover, and taking back more than it paid", async () => {
    const paymentId = await confirmedPayment();
    expect(
      await errorCode(createAdjustment(paymentId, 500, [{ rent_period_id: fx.periods[1].id, amount: 500 }]))
    ).toBe("BBK00");
    expect(
      await errorCode(createAdjustment(paymentId, -6000, [{ rent_period_id: fx.periods[0].id, amount: -6000 }]))
    ).toBe("BBK00");
    expect(
      await errorCode(createAdjustment(paymentId, -500, [{ rent_period_id: fx.periods[0].id, amount: -400 }]))
    ).toBe("BBK00");
  });

  it("refuses a payment that doesn't exist, and anyone but the owner", async () => {
    const paymentId = await confirmedPayment();
    expect(
      await errorCode(
        createAdjustment("00000000-0000-4000-8000-000000000099", -100, [{ rent_period_id: fx.periods[0].id, amount: -100 }])
      )
    ).toBe("BBK04");
    expect(
      await errorCode(
        as(
          owner(OWNER_B),
          `select create_adjustment(gen_random_uuid(), $1, -100, 'x', 'sig.png', 'h', now(), $2::jsonb)`,
          [paymentId, JSON.stringify([{ rent_period_id: fx.periods[0].id, amount: -100 }])]
        )
      )
    ).toBe("BBK04");
  });
});

describe("hit_rate_limit", () => {
  it("allows up to the limit per window, then refuses", async () => {
    const hit = async () =>
      (await as<{ ok: boolean }>(service, `select hit_rate_limit('otp:x', 2, 3600) as ok`))[0].ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
  });

  it("is invisible to the browser roles", async () => {
    expect(await errorCode(as(owner(OWNER_A), `select hit_rate_limit('k', 1, 60)`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `select * from rate_limits`))).toBe("42501");
  });
});

describe("storage bucket", () => {
  it("is private and limited to photos and PDFs of at most 4 MB (0009)", async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'rent-register'`
    );
    expect(rows.map((r) => ({ ...r, file_size_limit: Number(r.file_size_limit) }))).toEqual([
      {
        public: false,
        file_size_limit: 4 * 1024 * 1024,
        allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"],
      },
    ]);
  });
});

describe("master data: locations, towers, houses", () => {
  it("loads the Excel register seed (2 sites, 7 towers, 40 houses) idempotently", async () => {
    const seed = readFileSync(SEED, "utf8").replace("OWNER@EXAMPLE.COM", "a@example.com");
    await db.exec(`truncate tenant_units, units, properties, locations, app_owner cascade`);
    await db.exec(seed);
    await db.exec(seed);
    const { rows } = await db.query<{ l: number; p: number; u: number; ac_t1: number }>(
      `select (select count(*)::int from locations) as l, (select count(*)::int from properties) as p,
              (select count(*)::int from units) as u,
              (select count(*)::int from units where property_code = 'AC-T1') as ac_t1`
    );
    expect(rows[0]).toEqual({ l: 2, p: 7, u: 40, ac_t1: 19 });
    expect((await db.query(`select user_id from app_owner`)).rows).toEqual([{ user_id: OWNER_A }]);
    // A seed run for a different email must not take over ownership.
    const other = readFileSync(SEED, "utf8").replace("OWNER@EXAMPLE.COM", "b@example.com");
    await expect(db.exec(other)).rejects.toThrow(/different account already owns/);
    const { rows: derived } = await db.query(
      `select tower_code, (select house_number from units where unit_code = 'RM-TS-02') as house
       from properties where property_code = 'RM-TW'`
    );
    expect(derived).toEqual([{ tower_code: "TW", house: "02" }]);
  });

  it.each([
    ["a lowercase code", `insert into properties (property_code, location_code, name) values ('ac-t9', 'AC', 'x')`],
    ["a tower outside its site", `insert into properties (property_code, location_code, name) values ('RM-T9', 'AC', 'x')`],
    ["a house outside its tower", `insert into units (unit_code, property_code, unit_type) values ('AC-T2-G01', 'AC-T1', 'commercial')`],
    ["a house in a tower that doesn't exist", `insert into units (unit_code, property_code, unit_type) values ('AC-T9-G01', 'AC-T9', 'commercial')`],
  ])("rejects %s", async (_label, sql) => {
    expect(await errorCode(db.query(sql))).not.toBe("ok");
  });

  it("never lets a code change, but allows renaming", async () => {
    expect(
      await errorCode(as(owner(OWNER_A), `update properties set property_code = 'AC-T9' where property_code = 'AC-T1'`))
    ).not.toBe("ok");
    expect(await errorCode(as(owner(OWNER_A), `update units set unit_code = 'AC-T1-X1' where unit_code = 'AC-T1-G06'`))).toBe(
      "BBK00"
    );
    await as(owner(OWNER_A), `update properties set name = 'Main Tower' where property_code = 'AC-T1'`);
    expect((await db.query(`select name from properties where property_code = 'AC-T1'`)).rows).toEqual([{ name: "Main Tower" }]);
  });

  it("forbids deleting houses, even for the owner", async () => {
    expect(await errorCode(as(owner(OWNER_A), `delete from units where unit_code = 'AC-T1-G06'`))).toBe("42501");
  });
});

describe("create_tenant", () => {
  it("links several houses under one combined rent", async () => {
    const id = await createTenant(OWNER_A, {
      name: "Mohan Das",
      rent: 12000,
      leaseStart: "2026-02-01",
      units: ["AC-T1-G03", "AC-T1-G04"],
    });
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-03-01')`, [[id]]);
    expect(await periodsOf(id)).toEqual([
      { period_month: "2026-02-01", amount_due: 12000 },
      { period_month: "2026-03-01", amount_due: 12000 },
    ]);
    expect((await tenancies("AC-T1-G04")).map((t) => t.tenant_id)).toEqual([id]);
  });

  it.each([
    ["an occupied house", ["AC-T1-G01"], "BBK09"],
    ["a house that doesn't exist", ["AC-T1-G09"], "BBK00"],
    ["no house", [], "BBK00"],
    ["the same house twice", ["AC-T1-G05", "AC-T1-G05"], "BBK00"],
  ])("rejects %s and writes nothing", async (_label, units, code) => {
    const before = (await db.query(`select 1 from tenants`)).rows.length;
    expect(await errorCode(createTenant(OWNER_A, { name: "X", rent: 1000, leaseStart: "2026-03-01", units }))).toBe(code);
    expect((await db.query(`select 1 from tenants`)).rows.length).toBe(before);
  });

  it("rejects a retired house", async () => {
    await db.query(`update units set is_active = false where unit_code = 'AC-T1-G06'`);
    expect(
      await errorCode(createTenant(OWNER_A, { name: "X", rent: 1000, leaseStart: "2026-03-01", units: ["AC-T1-G06"] }))
    ).toBe("BBK00");
  });

  it("keeps history append-only for the owner", async () => {
    expect(await errorCode(as(owner(OWNER_A), `update tenant_units set end_date = '2026-01-31'`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `delete from tenant_rent_rates`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `update tenants set name = 'x'`))).toBe("42501");
  });
});

describe("update_tenant", () => {
  function update(args: { units?: string[] | null; unitsFrom?: string | null; rent?: number | null; rentFrom?: string | null }) {
    return as(
      owner(OWNER_A),
      `select update_tenant($1, 'Asha', null, '+919876543210', 'both', $2::text[], $3, $4, $5, null)`,
      [fx.tenantA, args.units ?? null, args.unitsFrom ?? null, args.rent ?? null, args.rentFrom ?? null]
    );
  }

  it("swaps houses from a date: the dropped one ends the day before and is free from then", async () => {
    await update({ units: ["AC-T1-G05"], unitsFrom: "2026-03-01" });
    expect(await tenancies("AC-T1-G01")).toEqual([
      { tenant_id: fx.tenantA, start_date: "2026-01-15", end_date: "2026-02-28" },
    ]);
    expect(await tenancies("AC-T1-G05")).toEqual([{ tenant_id: fx.tenantA, start_date: "2026-03-01", end_date: null }]);
    // Someone else can take G01 from 1 March, not a day earlier.
    expect(
      await errorCode(createTenant(OWNER_A, { name: "Early", rent: 1, leaseStart: "2026-02-28", units: ["AC-T1-G01"] }))
    ).toBe("BBK09");
    await createTenant(OWNER_A, { name: "Next", rent: 1, leaseStart: "2026-03-01", units: ["AC-T1-G01"] });
  });

  it("refuses an occupied house, an empty house list, or a missing date", async () => {
    expect(await errorCode(update({ units: ["AC-T1-G01", "AC-T1-G02"], unitsFrom: "2026-03-01" }))).toBe("BBK09");
    expect(await errorCode(update({ units: [], unitsFrom: "2026-03-01" }))).toBe("BBK00");
    expect(await errorCode(update({ units: ["AC-T1-G05"] }))).toBe("BBK00");
  });

  it("changes rent from a month, re-pricing only untouched months", async () => {
    await update({ rent: 5500, rentFrom: "2026-03-01" });
    expect((await periodsOf(fx.tenantA)).map((p) => p.amount_due)).toEqual([5000, 5000, 5500]);
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-05-01')`, [[fx.tenantA]]);
    expect((await periodsOf(fx.tenantA)).map((p) => p.amount_due)).toEqual([5000, 5000, 5500, 5500, 5500]);
  });

  it("refuses a rent change for a month that already has a payment", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[2].id, amount: 5000 }] });
    expect(await errorCode(update({ rent: 5500, rentFrom: "2026-03-01" }))).toBe("BBK09");
    expect((await periodsOf(fx.tenantA)).map((p) => p.amount_due)).toEqual([5000, 5000, 5000]);
  });
});

describe("move_out_tenant and re-letting", () => {
  const moveOut = (tenantId: string, date: string) =>
    as(owner(OWNER_A), `select move_out_tenant($1, $2)`, [tenantId, date]);

  it("ends the houses, keeps the move-out month and dues, drops untouched later months", async () => {
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-05-01')`, [[fx.tenantA]]);
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const paymentId = await latestPaymentId();

    await moveOut(fx.tenantA, "2026-03-20");

    expect((await periodsOf(fx.tenantA)).map((p) => p.period_month)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(await allocated(fx.periods[0].id)).toBe(5000);
    expect(
      (await db.query(`select status, to_char(moved_out_on, 'YYYY-MM-DD') as d from tenants where id = $1`, [fx.tenantA])).rows
    ).toEqual([{ status: "inactive", d: "2026-03-20" }]);

    // Upkeep no longer bills them, even when asked for that tenant explicitly.
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-06-01')`, [[fx.tenantA]]);
    expect(await periodsOf(fx.tenantA)).toHaveLength(3);

    // The house is re-let the next day; its history shows both tenancies in order.
    const next = await createTenant(OWNER_A, { name: "Ramesh Store", rent: 6000, leaseStart: "2026-03-21", units: ["AC-T1-G01"] });
    expect(await tenancies("AC-T1-G01")).toEqual([
      { tenant_id: fx.tenantA, start_date: "2026-01-15", end_date: "2026-03-20" },
      { tenant_id: next, start_date: "2026-03-21", end_date: null },
    ]);
    // The first tenant's payment is untouched.
    expect((await db.query(`select tenant_id, status from payments where id = $1`, [paymentId])).rows).toEqual([
      { tenant_id: fx.tenantA, status: "confirmed" },
    ]);
  });

  it("refuses while a later month has a payment, or twice", async () => {
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-04-01')`, [[fx.tenantA]]);
    const { rows } = await db.query<{ id: string }>(
      `select id from rent_periods where tenant_id = $1 and period_month = '2026-04-01'`,
      [fx.tenantA]
    );
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: rows[0].id, amount: 5000 }] });
    expect(await errorCode(moveOut(fx.tenantA, "2026-03-20"))).toBe("BBK09");

    await moveOut(fx.tenantA2, "2026-03-31");
    expect(await errorCode(moveOut(fx.tenantA2, "2026-03-31"))).toBe("BBK09");
  });
});

describe("migration 0006 guard", () => {
  it("refuses to run on a database that already has tenants", async () => {
    const sql = readFileSync(path.join(MIGRATIONS, "0006_property_master_data.sql"), "utf8");
    await expect(db.exec(sql)).rejects.toThrow(/reset_owner_data\.sql/);
  });
});

describe("single owner (app_owner + is_app_owner)", () => {
  it("shows a signed-in non-owner nothing, and lets them change nothing", async () => {
    for (const table of ["locations", "properties", "units", "tenants", "tenant_units", "tenant_rent_rates", "rent_periods", "payments", "unit_occupancy"]) {
      expect(await as(owner(OWNER_B), `select * from ${table}`), table).toEqual([]);
    }
    expect(await errorCode(as(owner(OWNER_B), `insert into locations (location_code, name) values ('ZZ', 'x')`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_B), `update properties set name = 'x'`))).toBe("ok"); // RLS: matches no rows
    expect((await db.query(`select name from properties`)).rows).toEqual([{ name: "Tower 1" }]);
    expect(
      await errorCode(createTenant(OWNER_B, { name: "X", rent: 1, leaseStart: "2026-03-01", units: ["AC-T1-G06"] }))
    ).toBe("BBK04");
    expect(await errorCode(as(owner(OWNER_B), `select move_out_tenant($1, '2026-03-31')`, [fx.tenantA]))).toBe("BBK04");
  });

  it("fails closed: with no owner registered, even the former owner sees nothing", async () => {
    await db.exec(`truncate app_owner cascade`); // cascade: owner_profile (0013) references it
    expect(await as(owner(OWNER_A), `select * from tenants`)).toEqual([]);
    expect(
      await errorCode(createTenant(OWNER_A, { name: "X", rent: 1, leaseStart: "2026-03-01", units: ["AC-T1-G06"] }))
    ).toBe("BBK04");
  });

  it("allows only one owner row and hides it from the browser roles", async () => {
    expect(await errorCode(db.query(`insert into app_owner (user_id) values ('${OWNER_B}')`))).toBe("23505");
    expect(await errorCode(as(owner(OWNER_A), `select * from app_owner`))).toBe("42501");
    expect(await as(owner(OWNER_A), `select is_app_owner() as ok`)).toEqual([{ ok: true }]);
    expect(await as(owner(OWNER_B), `select is_app_owner() as ok`)).toEqual([{ ok: false }]);
  });
});

describe("draft tenants from the paper register (0007)", () => {
  // The master data seed is committed; the tenants seed holds real occupant
  // names, so it stays local (gitignored) and its test runs only where it exists.
  async function loadRegister() {
    await db.exec(`truncate tenant_units, tenant_rent_rates, rent_periods, tenants, units, properties, locations, app_owner cascade`);
    await db.exec(readFileSync(SEED, "utf8").replace("OWNER@EXAMPLE.COM", "a@example.com"));
  }

  /** A draft like the tenants seed makes: a name and houses, nothing else. */
  async function addDraft(name: string, units: string[]): Promise<string> {
    const [{ id }] = (
      await db.query<{ id: string }>(
        `insert into tenants (name, status, preferred_channel) values ($1, 'draft', 'both') returning id`,
        [name]
      )
    ).rows;
    await db.query(
      `insert into tenant_units (tenant_id, unit_code, start_date) select $1, c, current_date from unnest($2::text[]) c`,
      [id, units]
    );
    return id;
  }

  it.skipIf(!existsSync(TENANT_SEED))("loads 26 draft tenants holding 35 houses, idempotently, and bills none of them", async () => {
    await loadRegister();
    await db.exec(readFileSync(TENANT_SEED, "utf8"));
    await db.exec(readFileSync(TENANT_SEED, "utf8"));
    const { rows } = await db.query<{ tenants: number; drafts: number; held: number; vacant: string }>(
      `select (select count(*)::int from tenants) as tenants,
              (select count(*)::int from tenants where status = 'draft') as drafts,
              (select count(*)::int from tenant_units where end_date is null) as held,
              (select string_agg(unit_code, ',' order by unit_code collate "C") from units u
                 where not exists (select 1 from tenant_units tu where tu.unit_code = u.unit_code)) as vacant`
    );
    expect(rows[0]).toEqual({
      tenants: 26,
      drafts: 26,
      held: 35,
      vacant: "AC-T1-105,RM-T1-102,RM-T2-102,RM-T2-G01,RM-TW-G03",
    });
    const [{ n }] = await as<{ n: number }>(service, `select ensure_rent_periods(null, '2026-12-01') as n`);
    expect(n).toBe(0);
    const units = await db.query(`select tenant_id from unit_occupancy where unit_code in ('AC-T1-G01', 'AC-T1-G04')`);
    expect(new Set(units.rows.map((r) => (r as { tenant_id: string }).tenant_id)).size).toBe(1);
  });

  it("units carry no occupant information any more", async () => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_name = 'units' and column_name = 'register_note'`
    );
    expect(rows).toEqual([]);
  });

  it("completing a draft's phone, rent and lease start makes it active and starts billing", async () => {
    await loadRegister();
    const houses = ["AC-T1-G01", "AC-T1-G02", "AC-T1-G03", "AC-T1-G04"];
    const id = await addDraft("Mohan Das", houses);
    const save = (phone: string | null, rent: number | null, leaseStart: string | null) =>
      as(
        owner(OWNER_A),
        `select update_tenant($1, 'Mohan Das', null, $2, 'both', $3::text[], null, $4, null, $5, '2026-07-01')`,
        [id, phone, houses, rent, leaseStart]
      );

    // Partial details are saved but it stays a draft; rent without a lease start is refused.
    await save("+919876543210", null, null);
    expect((await db.query(`select status, phone from tenants where id = $1`, [id])).rows).toEqual([
      { status: "draft", phone: "+919876543210" },
    ]);
    expect(await errorCode(save("+919876543210", 12000, null))).toBe("BBK00");

    await save("+919876543210", 12000, "2026-08-01");
    expect((await db.query(`select status, to_char(lease_start, 'YYYY-MM-DD') as d from tenants where id = $1`, [id])).rows)
      .toEqual([{ status: "active", d: "2026-08-01" }]);
    expect((await tenancies("AC-T1-G01"))[0]).toMatchObject({ tenant_id: id, start_date: "2026-08-01", end_date: null });

    await as(service, `select ensure_rent_periods($1::uuid[], '2026-10-01')`, [[id]]);
    expect(await periodsOf(id)).toEqual([
      { period_month: "2026-08-01", amount_due: 12000 },
      { period_month: "2026-09-01", amount_due: 12000 },
      { period_month: "2026-10-01", amount_due: 12000 },
    ]);
  });

  it("a draft's houses can be changed freely, and a draft can be moved out", async () => {
    await loadRegister();
    const id = await addDraft("Dutta", ["RM-TS-01"]);
    await as(owner(OWNER_A), `select update_tenant($1, 'Dutta', null, null, 'both', $2::text[], null, null, null, null)`, [
      id,
      ["RM-TS-01", "RM-T1-102"],
    ]);
    expect((await tenancies("RM-T1-102")).map((t) => t.tenant_id)).toEqual([id]);
    await as(owner(OWNER_A), `select move_out_tenant($1, current_date)`, [id]);
    expect((await db.query(`select status from tenants where id = $1`, [id])).rows).toEqual([{ status: "inactive" }]);
  });

  it("an active tenant still needs a phone", async () => {
    expect(
      await errorCode(
        as(owner(OWNER_A), `select update_tenant($1, 'Asha', null, null, 'both', null, null, null, null, null)`, [fx.tenantA])
      )
    ).toBe("BBK00");
  });
});

describe("billing start vs lease start (0008)", () => {
  async function draftFor(name: string, units: string[]): Promise<string> {
    const [{ id }] = (
      await db.query<{ id: string }>(
        `insert into tenants (name, status, preferred_channel) values ($1, 'draft', 'both') returning id`,
        [name]
      )
    ).rows;
    await db.query(
      `insert into tenant_units (tenant_id, unit_code, start_date) select $1, c, current_date from unnest($2::text[]) c`,
      [id, units]
    );
    return id;
  }

  function complete(id: string, units: string[], leaseStart: string, paidThrough: string | null) {
    return as(
      owner(OWNER_A),
      `select update_tenant($1, 'X', null, '+919876543210', 'both', $2::text[], null, 12000, null, $3, $4)`,
      [id, units, leaseStart, paidThrough]
    );
  }

  async function billingStart(id: string): Promise<string | null> {
    const { rows } = await db.query<{ d: string | null }>(
      `select to_char(billing_start, 'YYYY-MM-DD') as d from tenants where id = $1`,
      [id]
    );
    return rows[0].d;
  }

  it("an old lease start with rent paid up to Sep 2026 bills only from Oct 2026", async () => {
    const id = await draftFor("Old tenant", ["AC-T1-G05"]);
    await complete(id, ["AC-T1-G05"], "2019-04-01", "2026-09-01");
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-12-01')`, [[id]]);

    expect(await billingStart(id)).toBe("2026-10-01");
    expect((await periodsOf(id)).map((p) => p.period_month)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    // The tenancy itself still records when they moved in.
    expect((await tenancies("AC-T1-G05"))[0]).toMatchObject({ tenant_id: id, start_date: "2019-04-01" });
  });

  it("defaults 'paid up to' to last month, so billing starts this month", async () => {
    const id = await draftFor("Default", ["AC-T1-G05"]);
    await complete(id, ["AC-T1-G05"], "2019-04-01", null);
    const [{ m }] = (await db.query<{ m: string }>(`select to_char(date_trunc('month', current_date), 'YYYY-MM-DD') as m`)).rows;
    expect(await billingStart(id)).toBe(m);
  });

  it("never starts billing before the lease month", async () => {
    const id = await draftFor("Recent", ["AC-T1-G05"]);
    await complete(id, ["AC-T1-G05"], "2026-08-15", "2026-03-01");
    expect(await billingStart(id)).toBe("2026-08-01");
  });

  it("a prepaid future month creates nothing until the month after it", async () => {
    const id = await draftFor("Prepaid", ["AC-T1-G05"]);
    await complete(id, ["AC-T1-G05"], "2019-04-01", "2027-01-01");
    await as(service, `select ensure_rent_periods($1::uuid[], '2027-03-01')`, [[id]]);
    expect((await periodsOf(id)).map((p) => p.period_month)).toEqual(["2027-02-01", "2027-03-01"]);
  });

  it("create_tenant bills from the lease month, or the month after 'paid up to' when given", async () => {
    const fresh = await createTenant(OWNER_A, { name: "New", rent: 5000, leaseStart: "2026-09-10", units: ["AC-T1-G05"] });
    expect(await billingStart(fresh)).toBe("2026-09-01");

    const [{ id: paying }] = await as<{ id: string }>(
      owner(OWNER_A),
      `select create_tenant('Paper payer', null, '+919876543212', 'both', 4000, '2018-01-01', array['AC-T1-G06'], '2026-08-01') as id`
    );
    expect(await billingStart(paying)).toBe("2026-09-01");
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-10-01')`, [[paying]]);
    expect(await periodsOf(paying)).toEqual([
      { period_month: "2026-09-01", amount_due: 4000 },
      { period_month: "2026-10-01", amount_due: 4000 },
    ]);
  });
});

describe("security deposit (0008)", () => {
  async function deposit(id: string): Promise<number | null> {
    const { rows } = await db.query<{ d: string | null }>(`select deposit_amount as d from tenants where id = $1`, [id]);
    return rows[0].d === null ? null : Number(rows[0].d);
  }

  it("can be set and changed while a draft, and is frozen once the tenant is active", async () => {
    const [{ id }] = (
      await db.query<{ id: string }>(`insert into tenants (name, status, preferred_channel) values ('Draft D', 'draft', 'both') returning id`)
    ).rows;
    await db.query(`insert into tenant_units (tenant_id, unit_code, start_date) values ($1, 'AC-T1-G05', current_date)`, [id]);
    const save = (dep: number | null, activate: boolean) =>
      as(
        owner(OWNER_A),
        `select update_tenant($1, 'Draft D', null, $2, 'both', null, null, $3, null, $4, '2026-09-01', $5)`,
        [id, activate ? "+919876543210" : null, activate ? 5000 : null, activate ? "2019-04-01" : null, dep]
      );

    await save(20000, false);
    expect(await deposit(id)).toBe(20000);
    await save(25000, false);
    expect(await deposit(id)).toBe(25000);

    await save(25000, true); // completes the draft with the same deposit
    expect((await db.query(`select status from tenants where id = $1`, [id])).rows).toEqual([{ status: "active" }]);

    // Now frozen: through the function...
    expect(await errorCode(as(owner(OWNER_A), `select update_tenant($1, 'Draft D', null, '+919876543210', 'both', null, null, null, null, null, null, 30000)`, [id]))).toBe("BBK09");
    // ...re-sending the same value or leaving it out is fine...
    await as(owner(OWNER_A), `select update_tenant($1, 'Draft D', null, '+919876543210', 'both', null, null, null, null, null, null, 25000)`, [id]);
    await as(owner(OWNER_A), `select update_tenant($1, 'Draft D', null, '+919876543210', 'both', null, null, null, null, null, null, null)`, [id]);
    // ...and even a direct UPDATE is refused by the trigger.
    expect(await errorCode(db.query(`update tenants set deposit_amount = 1 where id = $1`, [id]))).toBe("BBK09");
    expect(await deposit(id)).toBe(25000);
  });

  it("is optional, positive, and fixed at onboarding for a new tenant", async () => {
    const [{ id }] = await as<{ id: string }>(
      owner(OWNER_A),
      `select create_tenant('With deposit', null, '+919876543213', 'both', 5000, '2026-10-01', array['AC-T1-G05'], null, 10000) as id`
    );
    expect(await deposit(id)).toBe(10000);
    expect(await deposit(fx.tenantA)).toBeNull();
    expect(
      await errorCode(
        as(owner(OWNER_A), `select create_tenant('Bad', null, '+919876543214', 'both', 5000, '2026-10-01', array['AC-T1-G06'], null, -5)`)
      )
    ).toBe("23514");
  });
});

describe("tenant documents (0011)", () => {
  const doc = (overrides: Record<string, unknown> = {}) => ({
    type: "ID proof (Aadhaar)",
    path: `tenants/${fx.tenantA}/documents/ab12cd34-1-aadhaar.jpg`,
    ...overrides,
  });
  const add = (who: Role, d: { type: unknown; path: unknown; tenant?: string }) =>
    as(
      who,
      `insert into tenant_documents (tenant_id, document_type, storage_path, file_name, content_type, size_bytes)
       values ($1, $2, $3, 'aadhaar.jpg', 'image/jpeg', 2048) returning id`,
      [d.tenant ?? fx.tenantA, d.type, d.path]
    );

  it("lets the owner add, list and delete a document, but never edit one", async () => {
    const [{ id }] = await add(owner(OWNER_A), doc());
    expect(await as(owner(OWNER_A), `select document_type from tenant_documents`)).toEqual([
      { document_type: "ID proof (Aadhaar)" },
    ]);
    expect(await errorCode(as(owner(OWNER_A), `update tenant_documents set document_type = 'x'`))).toBe("42501");
    expect(await as(owner(OWNER_A), `delete from tenant_documents where id = $1 returning id`, [id])).toHaveLength(1);
  });

  it("keeps the file inside the tenant's own folder", async () => {
    expect(await errorCode(add(owner(OWNER_A), doc({ path: `tenants/${fx.tenantA2}/documents/x.jpg` })))).toBe("23514");
    expect(await errorCode(add(owner(OWNER_A), doc({ path: `tenants/${fx.tenantA}/documents/` })))).toBe("23514");
    expect(await errorCode(add(owner(OWNER_A), doc({ path: `payments/${fx.tenantA}/documents/x.jpg` })))).toBe("23514");
  });

  it("requires a document type of 1-60 characters (free text)", async () => {
    expect(await errorCode(add(owner(OWNER_A), doc({ type: "   " })))).toBe("23514");
    expect(await errorCode(add(owner(OWNER_A), doc({ type: "x".repeat(61) })))).toBe("23514");
    expect(await errorCode(add(owner(OWNER_A), doc({ type: "Electricity bill" })))).toBe("ok");
  });

  it("shows another account nothing and lets it add or delete nothing", async () => {
    await add(owner(OWNER_A), doc());
    expect(await as(owner(OWNER_B), `select * from tenant_documents`)).toEqual([]);
    expect(await errorCode(add(owner(OWNER_B), doc({ path: `tenants/${fx.tenantA}/documents/b.jpg` })))).toBe("42501");
    expect(await as(owner(OWNER_B), `delete from tenant_documents returning id`)).toEqual([]);
    expect((await db.query(`select 1 from tenant_documents`)).rows).toHaveLength(1);
  });
});

describe("receipt numbers (0012)", () => {
  const month = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
      .format(new Date())
      .replace("-", "/");
  const receiptNos = async (table: "payments" | "adjustments") =>
    (await db.query<{ receipt_no: string }>(`select receipt_no from ${table} order by created_at, receipt_no`)).rows.map(
      (r) => r.receipt_no
    );

  it("numbers payments yyyy/MM/NNN in the recorded month, one series across tenants", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    await createPayment(owner(OWNER_A), {
      tenant: fx.tenantA2,
      amount: 4000,
      allocations: [{ rent_period_id: fx.otherTenantPeriod, amount: 4000 }],
    });
    expect(await receiptNos("payments")).toEqual([`${month()}/001`, `${month()}/002`]);
  });

  it("leaves no gap when a payment is rejected", async () => {
    const full = [{ rent_period_id: fx.periods[0].id, amount: 5000 }];
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: full });
    expect(await errorCode(createPayment(owner(OWNER_A), { amount: 5000, allocations: full }))).toBe("BBK00");
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[1].id, amount: 5000 }] });
    expect(await receiptNos("payments")).toEqual([`${month()}/001`, `${month()}/002`]);
  });

  it("gives adjustments their own ADJ/ series", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    await as(
      owner(OWNER_A),
      `select create_adjustment(gen_random_uuid(), $1, -100, 'x', 'sig.png', md5(random()::text), now(), $2::jsonb)`,
      [await latestPaymentId(), JSON.stringify([{ rent_period_id: fx.periods[0].id, amount: -100 }])]
    );
    expect(await receiptNos("adjustments")).toEqual([`ADJ/${month()}/001`]);
    expect(await receiptNos("payments")).toEqual([`${month()}/001`]);
  });

  it("can't be changed, and the counter is nobody's to touch", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    expect(await errorCode(db.query(`update payments set receipt_no = '2000/01/001'`))).toBe("BBK00");
    expect(await errorCode(as(owner(OWNER_A), `select * from receipt_counters`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `select next_receipt_no('payment', now())`))).toBe("42501");
    expect(await errorCode(as(service, `select next_receipt_no('payment', now())`))).toBe("42501");
  });

  it("uses the Asia/Kolkata month and grows past 999 instead of truncating", async () => {
    // 2026-10-31 20:00 UTC is already 1 November in India.
    const [{ no }] = (
      await db.query<{ no: string }>(`select next_receipt_no('payment', '2026-10-31T20:00:00Z') as no`)
    ).rows;
    expect(no).toBe("2026/11/001");
    await db.exec(`update receipt_counters set last_no = 999 where month = '2026-11-01'`);
    const [{ next }] = (
      await db.query<{ next: string }>(`select next_receipt_no('payment', '2026-11-02T00:00:00Z') as next`)
    ).rows;
    expect(next).toBe("2026/11/1000");
  });
});

describe("owner profile (0013)", () => {
  const save = (who: Role, first: string, signature: string | null = null) =>
    as(
      who,
      `insert into owner_profile (first_name, last_name, signature_name, signature_path)
       values ($1, 'Sahu', 'Anil Sahu', $2)
       on conflict (singleton) do update set first_name = excluded.first_name, signature_path = excluded.signature_path`,
      [first, signature]
    );

  it("lets the owner create and edit the one row, but not delete it", async () => {
    await save(owner(OWNER_A), "Ramesh");
    await save(owner(OWNER_A), "Ramesh", "owner/signature-1.png");
    expect(await as(owner(OWNER_A), `select first_name, signature_path from owner_profile`)).toEqual([
      { first_name: "Ramesh", signature_path: "owner/signature-1.png" },
    ]);
    expect(await errorCode(as(owner(OWNER_A), `delete from owner_profile`))).toBe("42501");
    expect(await errorCode(as(owner(OWNER_A), `insert into owner_profile (singleton, first_name) values (false, 'x')`))).toBe(
      "23514"
    );
  });

  it("checks names and keeps the signature in the owner folder", async () => {
    expect(await errorCode(save(owner(OWNER_A), " Ramesh"))).toBe("23514");
    expect(await errorCode(save(owner(OWNER_A), ""))).toBe("23514");
    expect(await errorCode(save(owner(OWNER_A), "Ramesh", "payments/x.png"))).toBe("23514");
  });

  it("shows another account nothing and lets it write nothing", async () => {
    await save(owner(OWNER_A), "Ramesh");
    expect(await as(owner(OWNER_B), `select * from owner_profile`)).toEqual([]);
    expect(await errorCode(as(owner(OWNER_B), `update owner_profile set first_name = 'x' returning 1`))).toBe("ok");
    expect((await db.query<{ first_name: string }>(`select first_name from owner_profile`)).rows).toEqual([
      { first_name: "Ramesh" },
    ]);
    await db.exec(`truncate owner_profile`);
    expect(await errorCode(save(owner(OWNER_B), "Mallory"))).toBe("42501");
  });
});

describe("correct_paid_through (0014)", () => {
  const correct = (who: Role, paidThrough: string | null, tenant = fx.tenantA) =>
    as<{ billing_start: string }>(
      who,
      `select to_char(correct_paid_through($1, $2::date), 'YYYY-MM-DD') as billing_start`,
      [tenant, paidThrough]
    );
  const billingStart = async () =>
    (
      await db.query<{ b: string }>(`select to_char(billing_start, 'YYYY-MM-DD') as b from tenants where id = $1`, [
        fx.tenantA,
      ])
    ).rows[0].b;
  const months = async () => (await periodsOf(fx.tenantA)).map((p) => p.period_month);

  it("moves billing later, dropping the months it no longer bills", async () => {
    // Asha: lease 2026-01-15, billed Jan-Mar.
    expect(await correct(owner(OWNER_A), "2026-01-01")).toEqual([{ billing_start: "2026-02-01" }]);
    expect(await billingStart()).toBe("2026-02-01");
    expect(await months()).toEqual(["2026-02-01", "2026-03-01"]);
  });

  it("moves billing earlier (not before the lease month), adding the months as owed at the first rent", async () => {
    await correct(owner(OWNER_A), "2026-02-01");
    expect(await months()).toEqual(["2026-03-01"]);
    expect(await correct(owner(OWNER_A), "2025-06-01")).toEqual([{ billing_start: "2026-01-01" }]);
    expect(await periodsOf(fx.tenantA)).toEqual([
      { period_month: "2026-01-01", amount_due: 5000 },
      { period_month: "2026-02-01", amount_due: 5000 },
      { period_month: "2026-03-01", amount_due: 5000 },
    ]);
    const rates = await db.query<{ m: string }>(
      `select to_char(effective_month, 'YYYY-MM-DD') as m from tenant_rent_rates where tenant_id = $1`,
      [fx.tenantA]
    );
    expect(rates.rows).toEqual([{ m: "2026-01-01" }]);
  });

  it("won't drop a month that has a payment, and leaves payments where they are", async () => {
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[1].id, amount: 5000 }] });
    expect(await errorCode(correct(owner(OWNER_A), "2026-02-01"))).toBe("BBK09");
    expect(await billingStart()).toBe("2026-01-01");
    // Dropping only the unpaid January is fine; February keeps its payment.
    await correct(owner(OWNER_A), "2026-01-01");
    expect(await allocated(fx.periods[1].id)).toBe(5000);
  });

  it("refuses non-owners, drafts and moved-out tenants, and a missing month", async () => {
    expect(await errorCode(correct(owner(OWNER_B), "2026-01-01"))).toBe("BBK04");
    expect(await errorCode(correct(owner(OWNER_A), null))).toBe("BBK00");
    expect(await errorCode(correct(owner(OWNER_A), "2099-01-01"))).toBe("BBK00");
    await as(owner(OWNER_A), `select move_out_tenant($1, '2026-03-31')`, [fx.tenantA]);
    expect(await errorCode(correct(owner(OWNER_A), "2026-01-01"))).toBe("BBK09");
    expect(await errorCode(as(owner(OWNER_A), `update tenants set billing_start = '2026-02-01'`))).toBe("42501");
  });
});

describe("audit log (0015)", () => {
  type Entry = { action: string; actor_kind: string; changes: Record<string, [unknown, unknown]>; tx_id: string };
  const log = async (filter = "true", params: unknown[] = []) =>
    (
      await db.query<Entry>(
        `select action, actor_kind, changes, tx_id::text from audit_log where ${filter} order by id`,
        params
      )
    ).rows;
  const updateTenant = (args: { phone?: string; rent?: number; month?: string }) =>
    as(owner(OWNER_A), `select update_tenant($1, 'Asha', null, $2, 'both', null, null, $3, $4, null)`, [
      fx.tenantA,
      args.phone ?? "+919876543210",
      args.rent ?? null,
      args.month ?? null,
    ]);

  it("records onboarding: the tenant, the tenancy and the first rent, by the owner", async () => {
    const rows = await log(`tenant_id = $1`, [fx.tenantA]);
    expect(rows.map((r) => r.action)).toEqual(["tenant.created", "rent_rate.set", "tenancy.started"]);
    expect(new Set(rows.map((r) => r.actor_kind))).toEqual(new Set(["owner"]));
    expect(new Set(rows.map((r) => r.tx_id)).size).toBe(1);
    expect(rows[1].changes.monthly_amount).toEqual([null, 5000]);
  });

  it("keeps the old value of an edit, and skips edits that change nothing", async () => {
    await db.exec(`truncate audit_log`);
    await updateTenant({ phone: "+919800000000" });
    await updateTenant({ phone: "+919800000000" });
    expect(await log()).toEqual([
      expect.objectContaining({ action: "tenant.updated", changes: { phone: ["+919876543210", "+919800000000"] } }),
    ]);
  });

  it("keeps a rent that was overwritten for the same month, and the re-priced months", async () => {
    await db.exec(`truncate audit_log`);
    await updateTenant({ rent: 6000, month: "2026-03-01" });
    await updateTenant({ rent: 6500, month: "2026-03-01" });
    const rows = await log();
    expect(rows.map((r) => [r.action, r.changes.monthly_amount ?? r.changes.amount_due])).toEqual([
      ["rent_rate.set", [null, 6000]],
      ["rent_period.repriced", [5000, 6000]],
      ["rent_rate.changed", [6000, 6500]],
      ["rent_period.repriced", [6000, 6500]],
    ]);
  });

  it("groups a move-out with the tenancy it ends and the months it drops", async () => {
    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `select move_out_tenant($1, '2026-02-28')`, [fx.tenantA]);
    const rows = await log();
    expect(rows.map((r) => r.action).sort()).toEqual(["rent_period.deleted", "tenancy.ended", "tenant.moved_out"]);
    expect(new Set(rows.map((r) => r.tx_id)).size).toBe(1);
    expect(rows.find((r) => r.action === "rent_period.deleted")?.changes.period_month).toEqual(["2026-03-01", null]);
  });

  it("records a corrected 'paid up to' and the months it drops", async () => {
    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `select correct_paid_through($1, '2026-01-01')`, [fx.tenantA]);
    expect((await log()).map((r) => [r.action, Object.keys(r.changes)])).toEqual([
      ["rent_period.deleted", ["amount_due", "period_month"]],
      ["billing_start.corrected", ["billing_start"]],
    ]);
  });

  it("records master-data edits, documents and payments, and who recorded a payment", async () => {
    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `update units set label = 'Chemist' where unit_code = 'AC-T1-G01'`);
    const [{ id }] = await as<{ id: string }>(
      owner(OWNER_A),
      `insert into tenant_documents (tenant_id, document_type, storage_path, file_name, content_type, size_bytes)
       values ($1, 'ID proof', $2, 'id.jpg', 'image/jpeg', 10) returning id`,
      [fx.tenantA, `tenants/${fx.tenantA}/documents/id.jpg`]
    );
    await as(owner(OWNER_A), `delete from tenant_documents where id = $1`, [id]);
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    const paymentId = await latestPaymentId();
    await acknowledge("payment", paymentId);

    const rows = await log();
    expect(rows.map((r) => [r.action, r.actor_kind])).toEqual([
      ["unit.updated", "owner"],
      ["document.added", "owner"],
      ["document.deleted", "owner"],
      ["payment.recorded", "owner"],
      ["payment.acknowledged", "tenant"],
    ]);
    expect(rows[0].changes).toEqual({ label: [null, "Chemist"] });
    expect(rows[3].changes).toMatchObject({ amount: [null, 5000], mode: [null, "cash"] });
    expect(JSON.stringify(rows)).not.toMatch(/token_hash|sig\.png|tenant\.png/);

    const { rows: payment } = await db.query<{ recorded_by: string }>(`select recorded_by from payments where id = $1`, [
      paymentId,
    ]);
    expect(payment).toEqual([{ recorded_by: OWNER_A }]);
    expect(await errorCode(as(service, `update payments set recorded_by = null where id = $1`, [paymentId]))).toBe("BBK00");
  });

  it("can't be written, edited or deleted directly - not even by the service role", async () => {
    for (const who of [owner(OWNER_A), service]) {
      expect(
        await errorCode(
          as(who, `insert into audit_log (actor_kind, action, entity_type) values ('system', 'x.y', 'x')`)
        )
      ).toBe("42501");
      expect(await errorCode(as(who, `update audit_log set action = 'x.y'`))).toBe("42501");
      expect(await errorCode(as(who, `delete from audit_log`))).toBe("42501");
    }
    // Even with table rights, the trigger refuses.
    expect(await errorCode(db.query(`delete from audit_log`))).toBe("BBK09");
  });

  it("shows the owner the log, and nobody else", async () => {
    expect((await as(owner(OWNER_A), `select 1 from audit_log`)).length).toBeGreaterThan(0);
    expect(await as(owner(OWNER_B), `select 1 from audit_log`)).toEqual([]);
  });

  it("log_event: the owner logs their own events, the service role names the actor, others are refused", async () => {
    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `select log_event('receipt.downloaded', $1, 'payment', 'p1')`, [fx.tenantA]);
    await as(service, `select log_event('auth.sign_in_failed', null, null, null, '{"method":"password"}', 'visitor')`);
    expect(await errorCode(as(owner(OWNER_B), `select log_event('auth.sign_in')`))).toBe("BBK04");
    expect(await errorCode(as(owner(OWNER_A), `select log_event('payment.recorded')`))).toBe("BBK00");
    expect(await errorCode(as({ role: "anon" } as unknown as Role, `select log_event('auth.sign_in')`))).toBe("42501");
    const rows = await db.query<{ action: string; actor_kind: string; actor_id: string | null; entity_type: string }>(
      `select action, actor_kind, actor_id, entity_type from audit_log order by id`
    );
    expect(rows.rows).toEqual([
      { action: "receipt.downloaded", actor_kind: "owner", actor_id: OWNER_A, entity_type: "payment" },
      { action: "auth.sign_in_failed", actor_kind: "visitor", actor_id: null, entity_type: "auth" },
    ]);
  });
});

describe("government tenants with untracked rent (0016)", () => {
  /** A government tenant whose rent is paid to the owner directly: no phone, no billing. */
  async function createGovt(rent: number | null = 20000): Promise<string> {
    const [row] = await as<{ id: string }>(
      owner(OWNER_A),
      `select create_tenant('Block Office', null, null, 'both', $1, '2026-01-01', array['AC-T1-G03'], null, null,
         'government', false) as id`,
      [rent]
    );
    return row.id;
  }

  async function tenantRow(id: string) {
    const { rows } = await db.query<{ status: string; tenant_kind: string; rent_tracked: boolean; billing_start: string | null }>(
      `select status, tenant_kind, rent_tracked, to_char(billing_start, 'YYYY-MM-DD') as billing_start
       from tenants where id = $1`,
      [id]
    );
    return rows[0];
  }

  it("is active and holds its houses, but never gets rent months, even when asked by id", async () => {
    const id = await createGovt();
    expect(await tenantRow(id)).toEqual({
      status: "active",
      tenant_kind: "government",
      rent_tracked: false,
      billing_start: null,
    });
    expect((await tenancies("AC-T1-G03")).map((t) => t.tenant_id)).toEqual([id]);
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-12-01')`, [[id]]);
    await as(service, `select ensure_rent_periods(null, '2026-12-01')`);
    expect(await periodsOf(id)).toEqual([]);
    // Rent is optional while untracked.
    await db.exec(`truncate tenant_units cascade`);
    expect(await errorCode(createGovt(null))).toBe("ok");
  });

  it("only a government tenant may skip tracking or the phone; existing tenants are backfilled by business name", async () => {
    const create = (kind: string, phone: string | null, tracked: boolean) =>
      as(
        owner(OWNER_A),
        `select create_tenant('X', null, $1, 'both', 1000, '2026-01-01', array['AC-T1-G04'], null, null, $2, $3)`,
        [phone, kind, tracked]
      );
    expect(await errorCode(create("business", "+919876543210", false))).toBe("BBK00");
    expect(await errorCode(create("individual", null, true))).toBe("BBK00");
    expect(await errorCode(create("government", null, true))).toBe("ok");
    expect(await errorCode(db.query(`update tenants set rent_tracked = false where id = $1`, [fx.tenantA]))).toBe("23514");
    expect((await tenantRow(fx.tenantA)).tenant_kind).toBe("individual");
  });

  it("a government draft is completed untracked with just a lease start", async () => {
    const [{ id }] = (
      await db.query<{ id: string }>(`insert into tenants (name, status, preferred_channel) values ('Tahasil', 'draft', 'both') returning id`)
    ).rows;
    await as(
      owner(OWNER_A),
      `select update_tenant($1, 'Tahasil', null, null, 'both', array['AC-T1-G05'], null, null, null, '2025-04-01', null, null,
         'government', false)`,
      [id]
    );
    expect(await tenantRow(id)).toEqual({ status: "active", tenant_kind: "government", rent_tracked: false, billing_start: null });
    // It can't change type while untracked.
    expect(
      await errorCode(
        as(owner(OWNER_A), `select update_tenant($1, 'Tahasil', null, '+919876543210', 'both', null, null, null, null, null,
          null, null, 'business')`, [id])
      )
    ).toBe("BBK09");
  });

  it("start_rent_tracking bills from the month after 'paid up to'; stop undoes it until a payment exists", async () => {
    const id = await createGovt(null);
    expect(await errorCode(as(owner(OWNER_A), `select start_rent_tracking($1, null, '2026-02-01')`, [id]))).toBe("BBK00");
    expect(await errorCode(as(owner(OWNER_B), `select start_rent_tracking($1, 20000, '2026-02-01')`, [id]))).toBe("BBK04");
    expect(await errorCode(as(owner(OWNER_A), `select correct_paid_through($1, '2026-02-01')`, [id]))).toBe("BBK09");

    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `select start_rent_tracking($1, 20000, '2026-02-01')`, [id]);
    expect(await tenantRow(id)).toMatchObject({ rent_tracked: true, billing_start: "2026-03-01" });
    const months = await periodsOf(id);
    expect(months[0]).toEqual({ period_month: "2026-03-01", amount_due: 20000 });
    expect(await errorCode(as(owner(OWNER_A), `select start_rent_tracking($1, 20000, null)`, [id]))).toBe("BBK09");

    const { rows: actions } = await db.query<{ action: string }>(
      `select action from audit_log where entity_type = 'tenant' order by id`
    );
    expect(actions.map((a) => a.action)).toEqual(["rent_tracking.started"]);

    await as(owner(OWNER_A), `select stop_rent_tracking($1)`, [id]);
    expect(await tenantRow(id)).toMatchObject({ rent_tracked: false, billing_start: null });
    expect(await periodsOf(id)).toEqual([]);

    await as(owner(OWNER_A), `select start_rent_tracking($1, null, '2026-02-01')`, [id]);
    const [march] = (
      await db.query<{ id: string }>(`select id from rent_periods where tenant_id = $1 and period_month = '2026-03-01'`, [id])
    ).rows;
    await createPayment(owner(OWNER_A), { tenant: id, amount: 20000, allocations: [{ rent_period_id: march.id, amount: 20000 }] });
    expect(await errorCode(as(owner(OWNER_A), `select stop_rent_tracking($1)`, [id]))).toBe("BBK09");
    expect(await errorCode(as(owner(OWNER_A), `select stop_rent_tracking($1)`, [fx.tenantA]))).toBe("BBK09");
  });
});

describe("stored audit text (0017)", () => {
  type Text = { action: string; title: string; details: string; actor_name: string };
  const texts = async (filter = "true", params: unknown[] = []) =>
    (await db.query<Text>(`select action, title, details, actor_name from audit_log where ${filter} order by id`, params))
      .rows;
  const sql = async (expr: string, params: unknown[] = []) =>
    (await db.query<{ v: string }>(`select ${expr} as v`, params)).rows[0].v;

  it("formats money, dates and times exactly as the app does", async () => {
    for (const amount of [0, 5, 999.5, 5000, 30000, 123456.78, 1234567.5, 100000000, -500, -123456]) {
      expect(await sql(`audit_money($1)`, [amount])).toBe(formatMoney(amount));
    }
    for (const day of ["2026-01-05", "2026-06-30", "2026-07-01", "2026-09-05", "2026-12-31"]) {
      expect(await sql(`audit_date($1::date)`, [day])).toBe(formatDateKey(day));
      expect(await sql(`audit_month($1::date)`, [day])).toBe(formatMonth(day));
    }
    for (const at of ["2026-10-26T13:20:00Z", "2026-06-01T00:05:00Z", "2026-09-28T06:30:00Z", "2026-07-01T18:30:00Z"]) {
      expect(await sql(`audit_datetime($1::timestamptz)`, [at])).toBe(formatDateTime(at));
    }
  });

  it("uses the app's labels for every action and value", async () => {
    for (const action of AUDIT_ACTIONS) {
      expect(await sql(`audit_action_label($1)`, [action])).toBe(auditActionLabel(action));
    }
    const value = (v: string, format: string) => sql(`audit_value(to_jsonb($1::text), $2)`, [v, format]);
    for (const [k, d] of Object.entries(TENANT_STATUS_DISPLAY)) expect(await value(k, "status")).toBe(d.label);
    for (const [k, label] of Object.entries(TENANT_KIND_LABELS)) expect(await value(k, "kind")).toBe(label);
    for (const [k, label] of Object.entries(PREFERRED_CHANNEL_LABELS)) expect(await value(k, "channel")).toBe(label);
    for (const [k, label] of Object.entries(UNIT_TYPE_LABELS)) expect(await value(k, "unitType")).toBe(label);
    for (const [k, label] of Object.entries(PAYMENT_MODE_LABELS)) expect(await value(k, "mode")).toBe(label);
    for (const floor of ["G", "B", "B2", "1", "12"]) expect(await value(floor, "floor")).toBe(formatFloor(floor));
  });

  it("writes the text of a table change when it happens", async () => {
    await db.exec(`truncate audit_log`);
    const rent = (amount: number) =>
      as(owner(OWNER_A), `select update_tenant($1, 'Asha', null, '+919876543210', 'both', null, null, $2, '2026-03-01', null)`, [
        fx.tenantA,
        amount,
      ]);
    await rent(6000);
    await rent(6500);
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    await as(owner(OWNER_A), `select move_out_tenant($1, '2026-02-28')`, [fx.tenantA]);
    const rows = await texts();
    expect(rows.find((r) => r.action === "rent_rate.changed")).toMatchObject({
      title: "Rent changed",
      details: "Monthly rent: ₹6,000.00 → ₹6,500.00",
      actor_name: "Owner",
    });
    expect(rows.find((r) => r.action === "rent_rate.set")?.details).toBe("From month: March 2026 · Monthly rent: ₹6,000.00");
    expect(rows.find((r) => r.action === "payment.recorded")?.details).toMatch(
      /^Receipt: \d{4}\/\d{2}\/\d{3} · Amount: ₹5,000\.00 · Paid on: 5 Mar 2026 · Mode: Cash$/
    );
    const movedOut = rows.find((r) => r.action === "tenant.moved_out");
    expect(movedOut?.title).toBe("Moved out");
    expect(movedOut?.details).toContain("Status: Active → Moved out");
    expect(movedOut?.details).toContain("Moved out on: — → 28 Feb 2026");
    expect(rows.map((r) => r.details).join("\n")).not.toMatch(/inactive|bank_transfer|\d{4}-\d{2}-\d{2}/);
  });

  it("names the owner from their profile, and the tenant and the system by role", async () => {
    await as(owner(OWNER_A), `insert into owner_profile (first_name, last_name) values ('Ramesh', 'Sahu')`);
    await db.exec(`truncate audit_log`);
    await as(owner(OWNER_A), `update units set label = 'Chemist' where unit_code = 'AC-T1-G01'`);
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
    await acknowledge("payment", await latestPaymentId());
    await as(
      service,
      `select log_event('auth.sign_in_failed', null, null, null, '{"method":"password","reason":"wrong_password"}', 'visitor')`
    );
    expect((await texts()).map((r) => [r.title, r.actor_name, r.details])).toEqual([
      ["House details changed", "Ramesh Sahu", "Label: — → Chemist"],
      ["Payment recorded", "Ramesh Sahu", expect.stringContaining("Amount: ₹5,000.00")],
      ["Payment acknowledged by tenant", "Tenant", expect.stringMatching(/^Acknowledged: — → \d+ \w+ \d{4}, \d+:\d\d [ap]m IST$/)],
      ["Failed sign-in", "Not signed in", "Password · Wrong password"],
    ]);
  });

  it("writes the text of app events from their context", async () => {
    await db.exec(`truncate audit_log`);
    await as(
      owner(OWNER_A),
      `select log_event('message.sent', $1, 'payment', 'p1', '{"channel":"sms","delivered":false,"receiptNo":"2026/03/001"}')`,
      [fx.tenantA]
    );
    await as(owner(OWNER_A), `select log_event('message.sent', $1, 'payment', 'p1', '{"channel":"both","delivered":true}')`, [
      fx.tenantA,
    ]);
    await as(owner(OWNER_A), `insert into owner_profile (first_name, signature_path) values ('Ramesh', 'owner/a.png')`);
    await as(owner(OWNER_A), `update owner_profile set signature_path = 'owner/b.png'`);
    expect((await texts()).map((r) => [r.title, r.details])).toEqual([
      ["Link not delivered to tenant", "SMS · not delivered · Receipt 2026/03/001"],
      ["Link sent to tenant", "WhatsApp + SMS · delivered"],
      ["Profile set up", "First name: Ramesh · Saved signature added"],
      ["Profile changed", "Saved signature replaced"],
    ]);
  });

  it("has text on every row, and the text can't be rewritten", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from audit_log where title is null or details is null or actor_name is null`
    );
    expect(rows[0].n).toBe(0);
    expect(await errorCode(db.query(`update audit_log set title = 'x'`))).toBe("BBK09");
  });

  describe("audit_history_page", () => {
    type Page = {
      rows: { id: number; title: string; details: string; unit_code: string | null }[];
      total: number;
      all: number;
      page: number;
    };
    const page = async (args: Record<string, unknown> = {}, who: Role = owner(OWNER_A)) => {
      const names = Object.keys(args);
      const named = names.map((n, i) => `, p_${n} => $${i + 2}`).join("");
      const [row] = await as<{ v: Page }>(who, `select audit_history_page(p_tenant_id => $1${named}) as v`, [
        fx.tenantA,
        ...names.map((n) => args[n]),
      ]);
      return row.v;
    };
    const details = (p: Page) => p.rows.map((r) => r.details);
    const filters = (items: unknown[]) => JSON.stringify(items);

    beforeEach(async () => {
      await db.exec(`truncate audit_log`);
      for (let i = 1; i <= 25; i++) {
        const receiptNo = `2026/03/${String(i).padStart(3, "0")}`;
        await as(owner(OWNER_A), `select log_event('receipt.downloaded', $1, 'payment', 'p', $2::jsonb)`, [
          fx.tenantA,
          JSON.stringify({ receiptNo }),
        ]);
      }
      await as(owner(OWNER_A), `select log_event('receipt.downloaded', $1)`, [fx.tenantA2]);
    });

    it("returns one page, newest first, with the counts, and the last page when past the end", async () => {
      const first = await page();
      expect(first).toMatchObject({ total: 25, all: 25, page: 0 });
      expect(first.rows).toHaveLength(10);
      expect(details(first)[0]).toBe("Receipt 2026/03/025");
      expect(details(await page({ page: 2 }))).toEqual([
        "Receipt 2026/03/005",
        "Receipt 2026/03/004",
        "Receipt 2026/03/003",
        "Receipt 2026/03/002",
        "Receipt 2026/03/001",
      ]);
      expect((await page({ page: 9 })).page).toBe(2);
      expect((await page({ page_size: 25 })).rows).toHaveLength(25);
    });

    it("searches every word in who, what, house and details, taking % and _ literally", async () => {
      expect(details(await page({ search: "2026/03/007" }))).toEqual(["Receipt 2026/03/007"]);
      expect((await page({ search: "owner downloaded 2026/03/01" })).total).toBe(10);
      expect((await page({ search: "%" })).total).toBe(0);
      expect((await page({ search: "_" })).total).toBe(0);
      expect((await page({ search: "nothing like this" })).total).toBe(0);
    });

    it("applies column filters with and / or, Show and the dates", async () => {
      const ends = (value: string) => ({ field: "details", operator: "endsWith", value });
      expect((await page({ filters: filters([ends("009")]) })).total).toBe(1);
      expect((await page({ filters: filters([ends("009"), ends("010")]) })).total).toBe(0);
      expect((await page({ filters: filters([ends("009"), ends("010")]), logic: "or" })).total).toBe(2);
      expect((await page({ filters: filters([{ field: "unit_code", operator: "isNotEmpty" }]) })).total).toBe(0);
      expect((await page({ filters: filters([{ field: "title", operator: "contains", value: "" }]), logic: "or" })).total).toBe(25);
      expect((await page({ actions: ["tenant.updated"] })).total).toBe(0);
      expect((await page({ actions: ["receipt.downloaded"] })).total).toBe(25);
      expect((await page({ from: "2999-01-01" })).total).toBe(0);
    });

    it("sorts by a column either way, ties newest first", async () => {
      expect(details(await page({ sort: "title", dir: "asc" }))[0]).toBe("Receipt 2026/03/025");
      expect(details(await page({ sort: "at", dir: "asc" }))[0]).toBe("Receipt 2026/03/001");
    });

    it("refuses a bad query, and shows nothing to anyone but the owner", async () => {
      expect(await errorCode(page({ sort: "changes" }))).toBe("BBK00");
      expect(await errorCode(page({ page_size: 500 }))).toBe("BBK00");
      expect(await errorCode(page({ filters: filters([{ field: "changes", operator: "contains", value: "x" }]) }))).toBe("BBK00");
      expect(await page({}, owner(OWNER_B))).toMatchObject({ rows: [], total: 0, all: 0 });
      expect(await errorCode(page({}, { role: "anon" } as unknown as Role))).toBe("42501");
    });

    it("pages the whole log without a tenant, and searches, filters and sorts by tenant name", async () => {
      // A business name wins over the person's name, as tenantDisplayName does.
      await db.query(`update tenants set business_name = 'Lotus Prints' where id = $1`, [fx.tenantA2]);
      const whole = async (args: Record<string, unknown> = {}) => {
        const names = Object.keys(args);
        const named = names.map((n, i) => `${i ? ", " : ""}p_${n} => $${i + 1}`).join("");
        const [row] = await as<{ v: Page }>(owner(OWNER_A), `select audit_history_page(${named}) as v`, names.map((n) => args[n]));
        return row.v;
      };
      // 25 receipts for Asha, one for Lotus Prints, and the business-name edit.
      expect(await whole()).toMatchObject({ total: 27, all: 27, page: 0 });
      expect((await whole({ search: "lotus" })).total).toBe(2);
      expect((await whole({ search: "bimal" })).total).toBe(0);
      expect((await whole({ filters: filters([{ field: "tenant_name", operator: "equals", value: "asha" }]) })).total).toBe(25);
      const byTenant = await whole({ sort: "tenant_name", dir: "desc" });
      // Lotus Prints first: its name edit (newest), then its receipt download (no receipt number).
      expect(byTenant.rows.slice(0, 2).map((r) => [r.title, r.details])).toEqual([
        ["Tenant details changed", "Business: — → Lotus Prints"],
        ["Receipt downloaded", ""],
      ]);
      expect((await whole({ sort: "tenant_name", dir: "asc", page_size: 25 })).rows.every((r) => r.details.startsWith("Receipt"))).toBe(
        true
      );
      expect(await errorCode(whole({ sort: "tenant" }))).toBe("BBK00");
    });
  });
});

describe("tenant_months_page (0019)", () => {
  type MonthsPage = {
    rows: { period_month: string; amount_due: number; amount_allocated: number; display_status: string; month_label: string }[];
    total: number;
    all: number;
    page: number;
  };
  const months = async (args: Record<string, unknown> = {}, who: Role = owner(OWNER_A)) => {
    const names = Object.keys(args);
    const named = names.map((n, i) => `, p_${n} => $${i + 2}`).join("");
    const [row] = await as<{ v: MonthsPage }>(who, `select tenant_months_page(p_tenant_id => $1${named}) as v`, [
      fx.tenantA,
      ...names.map((n) => args[n]),
    ]);
    return row.v;
  };
  const labels = (p: MonthsPage) => p.rows.map((r) => r.month_label);

  beforeEach(async () => {
    // Jan-Mar 2026 (ended: owed) and, billed ahead, Oct 2026 onwards (not due yet while current).
    await as(service, `select ensure_rent_periods($1::uuid[], '2027-02-01')`, [[fx.tenantA]]);
    // January paid, February partly paid.
    await createPayment(owner(OWNER_A), {
      amount: 7000,
      allocations: [
        { rent_period_id: fx.periods[0].id, amount: 5000 },
        { rent_period_id: fx.periods[1].id, amount: 2000 },
      ],
    });
  });

  it("pages the months newest first, with the counts and the labels the app shows", async () => {
    const first = await months({ page_size: 10 });
    expect(first.all).toBe(14);
    expect(first).toMatchObject({ total: 14, page: 0 });
    expect(labels(first)[0]).toBe("February 2027");
    const last = await months({ page: 1, page_size: 10 });
    expect(labels(last)).toEqual(["April 2026", "March 2026", "February 2026", "January 2026"]);
    expect(last.rows.map((r) => r.display_status)).toEqual(["pending", "pending", "partially_paid", "paid"]);
    expect((await months({ page: 7 })).page).toBe(1);
  });

  it("shows unpaid, partly paid, paid and not-due-yet months", async () => {
    const shown = async (show: string) => labels(await months({ show, page_size: 100 }));
    expect(await shown("paid")).toEqual(["January 2026"]);
    expect(await shown("partly")).toEqual(["February 2026"]);
    expect((await shown("unpaid")).at(-1)).toBe("February 2026");
    const notDue = await months({ show: "notDue", page_size: 100 });
    expect(notDue.rows.every((r) => r.display_status === "not_due_yet")).toBe(true);
    expect(notDue.total + (await months({ show: "unpaid", page_size: 100 })).total + 1).toBe(14);
  });

  it("searches and filters the month and status labels, and sorts any column", async () => {
    expect(labels(await months({ search: "march" }))).toEqual(["March 2026"]);
    expect(labels(await months({ search: "2026 partially" }))).toEqual(["February 2026"]);
    expect((await months({ search: "%" })).total).toBe(0);
    const filters = JSON.stringify([{ field: "status", operator: "equals", value: "paid" }]);
    expect(labels(await months({ filters }))).toEqual(["January 2026"]);
    expect(labels(await months({ sort: "amount_allocated", dir: "desc" })).slice(0, 2)).toEqual(["January 2026", "February 2026"]);
    expect(labels(await months({ sort: "period_month", dir: "asc" }))[0]).toBe("January 2026");
  });

  it("refuses a bad query, and shows nothing to anyone but the owner", async () => {
    expect(await errorCode(months({ sort: "id" }))).toBe("BBK00");
    expect(await errorCode(months({ show: "everything" }))).toBe("BBK00");
    expect(await errorCode(months({ filters: JSON.stringify([{ field: "id", operator: "contains", value: "x" }]) }))).toBe("BBK00");
    expect(await months({}, owner(OWNER_B))).toMatchObject({ rows: [], total: 0, all: 0 });
    expect(await errorCode(months({}, { role: "anon" } as unknown as Role))).toBe("42501");
  });
});

describe("tenant_ledger_page (0020)", () => {
  type LedgerDbRow = {
    id: string;
    type: string;
    date: string;
    description: string;
    caption: string;
    debit: number;
    credit: number;
    balance: number;
    status: string;
    receipt_no: string | null;
  };
  type LedgerPage = { rows: LedgerDbRow[]; total: number; all: number; page: number };
  const ledger = async (args: Record<string, unknown> = {}, who: Role = owner(OWNER_A)) => {
    const names = Object.keys(args);
    const named = names.map((n, i) => `, p_${n} => $${i + 2}`).join("");
    const [row] = await as<{ v: LedgerPage }>(who, `select tenant_ledger_page(p_tenant_id => $1${named}) as v`, [
      fx.tenantA,
      ...names.map((n) => args[n]),
    ]);
    return row.v;
  };
  const pay = (date: string, amount: number, periodId: string) =>
    as(
      owner(OWNER_A),
      `select create_payment(gen_random_uuid(), $1, $2, $3, 'bank_transfer', 'NEFT', 'sig.png',
         md5(random()::text), now() + interval '14 days', $4::jsonb)`,
      [fx.tenantA, amount, date, JSON.stringify([{ rent_period_id: periodId, amount }])]
    );
  const all = async () => (await ledger({ sort: "date", dir: "asc", page_size: 100 })).rows;

  beforeEach(async () => {
    // Jan 2026 - Jan 2027 at 5,000: the months from this one on are upcoming.
    await as(service, `select ensure_rent_periods($1::uuid[], '2027-01-01')`, [[fx.tenantA]]);
    await pay("2026-01-10", 5000, fx.periods[0].id);
    await pay("2026-03-05", 5000, fx.periods[1].id);
    // A correction of the January payment: 500 less, so 500 more owed (dated today).
    const [{ id: janPayment }] = (
      await db.query<{ id: string }>(`select id from payments where payment_date = '2026-01-10'`)
    ).rows;
    await as(
      owner(OWNER_A),
      `select create_adjustment(gen_random_uuid(), $1, -500, 'Counted twice', 'sig.png',
         md5(random()::text), now() + interval '14 days', $2::jsonb)`,
      [janPayment, JSON.stringify([{ rent_period_id: fx.periods[0].id, amount: -500 }])]
    );
  });

  it("builds the journal with the app's text and a running balance over billed, confirmed rows", async () => {
    const rows = await all();
    expect(rows.slice(0, 5).map((r) => [r.type, r.date, r.description, r.debit, r.credit, r.balance, r.status])).toEqual([
      ["charge", "2026-01-01", "Rent due — January 2026", 5000, 0, 5000, "billed"],
      ["payment", "2026-01-10", "Payment received (bank transfer) — NEFT", 0, 5000, 0, "confirmed"],
      ["charge", "2026-02-01", "Rent due — February 2026", 5000, 0, 5000, "billed"],
      ["charge", "2026-03-01", "Rent due — March 2026", 5000, 0, 10000, "billed"],
      ["payment", "2026-03-05", "Payment received (bank transfer) — NEFT", 0, 5000, 5000, "confirmed"],
    ]);
    expect(rows[0].caption).toBe("Charge");
    expect(rows[1].caption).toMatch(/^#\d{4}\/\d{2}\/\d{3} · not signed by tenant$/);

    // Months from this one on are shown as upcoming and leave the balance alone;
    // the correction (a debit, dated today) still counts.
    const upcoming = rows.filter((r) => r.status === "upcoming");
    expect(upcoming.length).toBeGreaterThanOrEqual(3);
    const adjustment = rows.find((r) => r.type === "adjustment");
    expect(adjustment).toMatchObject({ description: "Adjustment — Counted twice", debit: 500, credit: 0, status: "confirmed" });
    expect(adjustment?.caption).toMatch(/^#ADJ\/\d{4}\/\d{2}\/\d{3} · not signed by tenant$/);
    const billed = rows.filter((r) => r.type === "charge" && r.status === "billed").length;
    expect(rows.at(-1)?.balance).toBe(billed * 5000 - 10000 + 500);
    for (const r of upcoming) expect(r.balance).toBe(rows[rows.indexOf(r) - 1].balance);
  });

  it("shows the all-time balance on every page and under every filter", async () => {
    const balances = new Map((await all()).map((r) => [r.id, r.balance]));
    const page2 = await ledger({ page: 1, page_size: 4 });
    expect(page2.rows).toHaveLength(4);
    for (const r of page2.rows) expect(r.balance).toBe(balances.get(r.id));
    const march = await ledger({ from: "2026-03-01", to: "2026-03-31" });
    expect(march.rows.map((r) => [r.description, r.balance])).toEqual([
      ["Payment received (bank transfer) — NEFT", 5000],
      ["Rent due — March 2026", 10000],
    ]);
    expect(march).toMatchObject({ total: 2, all: balances.size });
  });

  it("searches what the table shows, filters it, and sorts any column", async () => {
    expect((await ledger({ search: "january" })).rows.map((r) => r.description)).toEqual([
      "Rent due — January 2027",
      "Rent due — January 2026",
    ]);
    expect((await ledger({ search: "neft 10 jan" })).total).toBe(1);
    expect((await ledger({ search: "counted" })).rows.map((r) => r.type)).toEqual(["adjustment"]);
    expect((await ledger({ search: "%" })).total).toBe(0);
    const filters = JSON.stringify([{ field: "status", operator: "equals", value: "confirmed" }]);
    expect((await ledger({ filters })).total).toBe(3);
    expect((await ledger({ sort: "credit", dir: "desc" })).rows[0].credit).toBe(5000);
    expect((await ledger({ sort: "balance", dir: "asc" })).rows[0].balance).toBe(0);
    expect((await ledger({ page: 99 })).page).toBeGreaterThan(0);
  });

  it("refuses a bad query, and shows nothing to anyone but the owner", async () => {
    expect(await errorCode(ledger({ sort: "ref_id" }))).toBe("BBK00");
    expect(await errorCode(ledger({ filters: JSON.stringify([{ field: "debit", operator: "equals", value: "1" }]) }))).toBe("BBK00");
    expect(await ledger({}, owner(OWNER_B))).toMatchObject({ rows: [], total: 0, all: 0 });
    expect(await errorCode(ledger({}, { role: "anon" } as unknown as Role))).toBe("42501");
  });
});

describe("billing_page and billing_totals (0021)", () => {
  type BillingDbRow = {
    id: string;
    tenant_name: string;
    property_name: string;
    unit_codes: string[];
    period_month: string;
    month_label: string;
    amount_due: number;
    amount_allocated: number;
    balance: number;
    status: string;
    not_yet_due: boolean;
    paid_direct: boolean;
    payments: { receipt_no: string; payment_date: string; mode: string; amount: number }[];
  };
  type BillingPage = { rows: BillingDbRow[]; total: number; all: number; page: number };
  const billing = async (args: Record<string, unknown> = {}, who: Role = owner(OWNER_A)) => {
    const full = { from: "2026-01-01", to: "2026-03-01", ...args };
    const names = Object.keys(full);
    const named = names.map((n, i) => `p_${n} => $${i + 1}`).join(", ");
    const [row] = await as<{ v: BillingPage }>(who, `select billing_page(${named}) as v`, names.map((n) => full[n as keyof typeof full]));
    return row.v;
  };
  const totals = async (paidDirect = true, from = "2026-01-01", to = "2026-03-01") =>
    (await as<{ v: Record<string, number | null> }>(owner(OWNER_A), `select billing_totals($1, $2, $3) as v`, [from, to, paidDirect]))[0].v;
  const ids = (p: BillingPage) => p.rows.map((r) => `${r.tenant_name} ${r.month_label}`);

  beforeEach(async () => {
    // A government office paying the owner's bank directly: 20,000 a month from January.
    await as(
      owner(OWNER_A),
      `select create_tenant('Block Office', null, null, 'both', 20000, '2026-01-01', array['AC-T1-G03'], null, null,
         'government', false)`
    );
    // Asha pays January (recorded 5 March).
    await createPayment(owner(OWNER_A), { amount: 5000, allocations: [{ rent_period_id: fx.periods[0].id, amount: 5000 }] });
  });

  it("lists each tenant's months with tower, houses and receipts, plus paid-direct months", async () => {
    const page = await billing({ page_size: 100, sort: "tenant_name", dir: "asc" });
    expect(page).toMatchObject({ total: 9, all: 9, page: 0 });
    const asha = page.rows.find((r) => r.tenant_name === "Asha" && r.month_label === "January 2026");
    expect(asha).toMatchObject({
      property_name: "Tower 1",
      unit_codes: ["AC-T1-G01"],
      amount_due: 5000,
      amount_allocated: 5000,
      balance: 0,
      status: "paid",
      paid_direct: false,
    });
    expect(asha?.payments).toEqual([
      expect.objectContaining({ payment_date: "2026-03-05", mode: "cash", amount: 5000, receipt_no: expect.stringMatching(/^\d{4}\/\d{2}\/\d{3}$/) }),
    ]);
    const direct = page.rows.filter((r) => r.paid_direct);
    expect(direct.map((r) => [r.tenant_name, r.month_label, r.amount_due, r.amount_allocated, r.status])).toEqual([
      ["Block Office", "March 2026", 20000, 20000, "paid"],
      ["Block Office", "February 2026", 20000, 20000, "paid"],
      ["Block Office", "January 2026", 20000, 20000, "paid"],
    ]);
    expect((await billing({ paid_direct: false })).all).toBe(6);
  });

  it("makes the same paid-direct months as the app, up to two months ahead", async () => {
    const through = addMonthsToKey(currentMonthKey(), 2);
    const from = addMonthsToKey(currentMonthKey(), -1);
    const to = addMonthsToKey(currentMonthKey(), 5);
    const sql = (await billing({ from, to, show: "paidDirect", page_size: 100, sort: "period_month", dir: "asc" })).rows.map(
      (r) => [r.period_month, r.amount_due]
    );
    const js = paidDirectMonths(
      { leaseStart: "2026-01-01", movedOutOn: null },
      [{ effective_month: "2026-01-01", monthly_amount: 20000 }],
      monthsIn({ from, to }),
      through
    ).map((m) => [m.month, m.amount]);
    expect(sql).toEqual(js);
    expect(sql.at(-1)?.[0]).toBe(through);
  });

  it("shows unpaid, partly paid, paid and paid-direct months, and searches what the table shows", async () => {
    expect((await billing({ show: "paid" })).total).toBe(4);
    expect((await billing({ show: "paidDirect" })).total).toBe(3);
    expect((await billing({ show: "unpaid" })).total).toBe(5);
    expect((await billing({ show: "partly" })).total).toBe(0);
    expect((await billing({ search: "bimal" })).total).toBe(3);
    expect((await billing({ search: "tower 1 march" })).total).toBe(3);
    expect(ids(await billing({ search: "5 mar 2026" }))).toEqual(["Asha January 2026"]);
    expect((await billing({ search: "%" })).total).toBe(0);
    const filters = JSON.stringify([{ field: "status", operator: "equals", value: "Paid direct" }]);
    expect((await billing({ filters })).total).toBe(3);
  });

  it("sorts by need (status, then balance) and by any column", async () => {
    const byNeed = await billing({ sort: "status", dir: "desc", page_size: 100 });
    expect(byNeed.rows.slice(0, 2).map((r) => [r.tenant_name, r.status, r.balance])).toEqual([
      ["Asha", "pending", 5000],
      ["Asha", "pending", 5000],
    ]);
    expect(byNeed.rows.at(-1)?.paid_direct).toBe(true);
    expect((await billing({ sort: "amount_due", dir: "asc" })).rows[0].amount_due).toBe(4000);
    expect((await billing({ page: 50, page_size: 4 })).page).toBe(2);
  });

  it("totals the whole range for the stat cards", async () => {
    expect(await totals()).toEqual({
      billed: 87000,
      collected: 65000,
      balance: 22000,
      overdue: 22000,
      collection_rate: 75,
      tenants: 3,
    });
    expect(await totals(false)).toMatchObject({ billed: 27000, collected: 5000, collection_rate: 19, tenants: 2 });
    expect(await totals(true, "2030-01-01", "2030-02-01")).toMatchObject({ billed: 0, collection_rate: null, tenants: 0 });
  });

  it("refuses a bad query, and shows nothing to anyone but the owner", async () => {
    expect(await errorCode(billing({ sort: "id" }))).toBe("BBK00");
    expect(await errorCode(billing({ show: "owed" }))).toBe("BBK00");
    expect(await errorCode(billing({ from: "2026-03-01", to: "2026-01-01" }))).toBe("BBK00");
    expect(await billing({}, owner(OWNER_B))).toMatchObject({ rows: [], total: 0, all: 0 });
    expect(await errorCode(billing({}, { role: "anon" } as unknown as Role))).toBe("42501");
  });
});

describe("tenant_account_summary (0022)", () => {
  type Summary = {
    total_outstanding: number;
    overdue_months: number;
    not_yet_due: number;
    ended_months: number;
    paid_ended_months: number;
    can_stop_rent_tracking: boolean;
  };
  const summary = async (tenantId: string, who: Role = owner(OWNER_A)) =>
    (await as<{ v: Summary }>(who, `select tenant_account_summary($1) as v`, [tenantId]))[0].v;

  /** The tenant's months as the JS side reads them. */
  async function monthsOf(tenantId: string) {
    const { rows } = await db.query<{ id: string; period_month: string; amount_due: string; amount_allocated: string }>(
      `select id, to_char(period_month, 'YYYY-MM-DD') as period_month, amount_due, amount_allocated
       from rent_periods where tenant_id = $1`,
      [tenantId]
    );
    return rows;
  }

  it("splits owed (ended months) from not due yet, as summarizeBalance does", async () => {
    // Billed a few months ahead of today, like the app does.
    await as(service, `select ensure_rent_periods($1::uuid[], $2)`, [[fx.tenantA], addMonthsToKey(currentMonthKey(), 2)]);
    // January paid, February partly paid.
    await createPayment(owner(OWNER_A), {
      amount: 7000,
      allocations: [
        { rent_period_id: fx.periods[0].id, amount: 5000 },
        { rent_period_id: fx.periods[1].id, amount: 2000 },
      ],
    });
    const months = await monthsOf(fx.tenantA);
    const s = await summary(fx.tenantA);
    const js = summarizeBalance(months, currentMonthKey());
    expect({
      totalOutstanding: Number(s.total_outstanding),
      overdueMonths: s.overdue_months,
      notYetDue: Number(s.not_yet_due),
    }).toEqual(js);
    const ended = months.filter((m) => m.period_month < currentMonthKey());
    expect(s.ended_months).toBe(ended.length);
    expect(s.paid_ended_months).toBe(1); // January only; February is partly paid
    expect(s.overdue_months).toBe(ended.length - 1);
    expect(Number(s.not_yet_due)).toBeGreaterThan(0);
  });

  it("is all zeros for a tenant without months, and nothing for anyone but the owner", async () => {
    await db.query(`delete from rent_periods where tenant_id = $1`, [fx.tenantA2]);
    expect(await summary(fx.tenantA2)).toEqual({
      total_outstanding: 0,
      overdue_months: 0,
      not_yet_due: 0,
      ended_months: 0,
      paid_ended_months: 0,
      can_stop_rent_tracking: false,
    });
    expect(await summary(fx.tenantA, owner(OWNER_B))).toMatchObject({ total_outstanding: 0, ended_months: 0 });
    expect(await errorCode(summary(fx.tenantA, { role: "anon" } as unknown as Role))).toBe("42501");
  });

  it("allows stopping tracking only for a tracked government tenant with nothing recorded", async () => {
    const [{ id }] = await as<{ id: string }>(
      owner(OWNER_A),
      `select create_tenant('Block Office', null, null, 'both', 20000, '2026-01-01', array['AC-T1-G04'], null, null,
         'government', true) as id`
    );
    await as(service, `select ensure_rent_periods($1::uuid[], '2026-03-01')`, [[id]]);
    expect((await summary(id)).can_stop_rent_tracking).toBe(true);
    expect((await summary(fx.tenantA)).can_stop_rent_tracking).toBe(false); // an individual
    const [first] = (await db.query<{ id: string }>(`select id from rent_periods where tenant_id = $1 order by period_month limit 1`, [id]))
      .rows;
    await createPayment(owner(OWNER_A), { tenant: id, amount: 20000, allocations: [{ rent_period_id: first.id, amount: 20000 }] });
    expect((await summary(id)).can_stop_rent_tracking).toBe(false);
    // The same rule stop_rent_tracking enforces.
    expect(await errorCode(as(owner(OWNER_A), `select stop_rent_tracking($1)`, [id]))).toBe("BBK09");
  });
});

// Parity: the Drizzle rate limits (tables/rateLimits.ts) must count exactly
// as hit_rate_limit() / prune_rate_limits() (0004, D12) do, on the same
// table, so either adapter can take over mid-window. They run as
// service_role; nobody else may touch the counters.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleSystemRepositories, limitKind } from "@/server/adapters/drizzle/repositories/system";
import { asOwner, asService, createLedgerDb, type LedgerDb } from "./fixtures";

let l: LedgerDb;
let system: ReturnType<typeof drizzleSystemRepositories>;

beforeAll(async () => {
  l = await createLedgerDb({ oracles: true });
  system = drizzleSystemRepositories(l.db);
});

afterAll(async () => {
  await l?.close();
});

const sqlHit = async (key: string, limit: number, window: number) =>
  (await l.rows<{ ok: boolean }>(asService, sql`select hit_rate_limit(${key}, ${limit}, ${window}) as ok`))[0].ok;

describe("rate limits on Drizzle count as hit_rate_limit() does", () => {
  it("allows `limit` hits per window, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await system.rateLimits!.hit!("test:drizzle", 2, 3600));
    expect(results).toEqual([true, true, false, false]);
    const sqlResults = [];
    for (let i = 0; i < 4; i++) sqlResults.push(await sqlHit("test:sql", 2, 3600));
    expect(sqlResults).toEqual(results);
  });

  it("shares the counters with the SQL function, so a switch mid-window keeps counting", async () => {
    expect(await sqlHit("test:shared", 2, 3600)).toBe(true);
    expect(await system.rateLimits!.hit!("test:shared", 2, 3600)).toBe(true);
    expect(await sqlHit("test:shared", 2, 3600)).toBe(false);
    expect(await system.rateLimits!.hit!("test:shared", 2, 3600)).toBe(false);
  });

  it("counts each key and each window on its own", async () => {
    expect(await system.rateLimits!.hit!("test:a", 1, 3600)).toBe(true);
    expect(await system.rateLimits!.hit!("test:b", 1, 3600)).toBe(true);
    const [w] = await l.rows<{ n: number }>(
      asService,
      sql`select count(distinct window_start)::int as n from rate_limits where key in ('test:a', 'test:b')`
    );
    expect(w.n).toBe(1);
  });

  // PGlite has one connection, so these run one after another: this checks the count adds up;
  // the upsert on (key, window_start) is what makes real concurrent hits safe.
  it("many hits at once add up", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => system.rateLimits!.hit!("test:race", 3, 3600)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("refuses a nonsense limit (a caller bug) before any database work", async () => {
    await expect(system.rateLimits!.hit!("test:bad", 1, 0)).rejects.toThrow("bad rate limit 1/0s");
    await expect(system.rateLimits!.hit!("test:bad", -1, 60)).rejects.toThrow("bad rate limit -1/60s");
  });

  it("logs only the kind of limit, never the IP, id or hash in the key", () => {
    expect(limitKind("otp:ip:2001:db8:85a3::8a2e:370:7334")).toBe("otp:ip");
    expect(limitKind("otp:ip:203.0.113.7")).toBe("otp:ip");
    expect(limitKind("magic-link:email:5f2b9c")).toBe("magic-link:email");
    expect(limitKind("confirm:record:00000000-0000-4000-8000-000000000001")).toBe("confirm:record");
    expect(limitKind("owner:00000000-0000-4000-8000-00000000000a")).toBe("owner");
    expect(limitKind("nonsense")).toBe("?");
  });

  it("says to run 0028 when the login may not act as service_role", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(" "));
    // As the real login, without 0028's grant.
    await l.pg.exec(`revoke service_role from app_drizzle; set session authorization app_drizzle`);
    try {
      const failure = await system.rateLimits!.hit!("otp:ip:2001:db8::1", 5, 60).catch((e: Error) => e);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/^rate limit otp:ip: \[42501\]/);
      expect((failure as Error).message).not.toContain("2001");
      expect(errors.join("\n")).toContain("run migration 0028");
    } finally {
      console.error = original;
      await l.pg.exec(`reset role; set session authorization postgres; grant service_role to app_drizzle with inherit false, set true`);
    }
  });

  it("prunes windows older than a day, like prune_rate_limits()", async () => {
    await l.pg.exec(`
      insert into rate_limits (key, window_start, count) values
        ('old:1', now() - interval '2 days', 1), ('old:2', now() - interval '25 hours', 1),
        ('old:3', now() - interval '2 days', 1), ('recent', now() - interval '23 hours', 1);
    `);
    expect(await system.rateLimits!.prune!()).toBe(3);
    expect(await system.rateLimits!.prune!()).toBe(0);
    const [left] = await l.rows<{ n: number }>(asService, sql`select count(*)::int as n from rate_limits where key = 'recent'`);
    expect(left.n).toBe(1);
    await l.pg.exec(`insert into rate_limits (key, window_start, count) values ('old:4', now() - interval '3 days', 1)`);
    const [viaSql] = await l.rows<{ n: number }>(asService, sql`select prune_rate_limits() as n`);
    expect(viaSql.n).toBe(1);
  });

  it("the owner role can't read or change the counters", async () => {
    await expect(l.rows(asOwner, sql`select count(*) from rate_limits`)).rejects.toThrow();
    await expect(l.rows(asOwner, sql`select hit_rate_limit('x', 1, 60)`)).rejects.toThrow();
  });
});

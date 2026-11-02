// The bindings in src/server/infra: data always goes through the Drizzle
// adapter (A19), and ownerDb() without a session is a 401, never an
// unscoped repository.
import { beforeEach, describe, expect, it, vi } from "vitest";

const claims = vi.hoisted(() => ({ value: null as { sub: string } | null }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/server/adapters/supabase/auth", () => ({
  sessionJwtClaims: async () => claims.value,
  supabaseAuth: {},
}));
vi.mock("@/server/adapters/supabase/storage", () => ({ supabaseStorage: {} }));
vi.mock("@/server/adapters/twilio/messaging", () => ({ twilioMessaging: {} }));
vi.mock("@/server/adapters/drizzle", () => ({
  drizzleDb: () => "db",
  drizzleOwnerRepositories: (db: string, c: { sub: string }) => ({ kind: "owner", db, sub: c.sub }),
  drizzleSystemRepositories: (db: string) => ({ kind: "system", db }),
}));

const { ownerDb, systemDb } = await import("@/server/infra");

describe("infra bindings", () => {
  beforeEach(() => {
    claims.value = null;
  });

  it("ownerDb is the Drizzle owner repositories for the session's user", async () => {
    claims.value = { sub: "00000000-0000-4000-8000-000000000001" };
    expect(await ownerDb()).toEqual({ kind: "owner", db: "db", sub: "00000000-0000-4000-8000-000000000001" });
  });

  it("ownerDb with no session is a 401", async () => {
    await expect(ownerDb()).rejects.toMatchObject({ status: 401 });
  });

  it("systemDb is the Drizzle system repositories", () => {
    expect(systemDb()).toEqual({ kind: "system", db: "db" });
  });
});

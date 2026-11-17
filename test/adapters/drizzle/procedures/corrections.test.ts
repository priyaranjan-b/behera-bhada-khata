// The corrections PIN on Drizzle (0039): status and set call the SQL
// functions, which own the rules (test/schema.test.ts covers them); these
// pin the call and the shapes that come back - ISO times, the refusal.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { OwnerRepositories } from "@/server/ports";
import { createLedgerDb, OWNER, PIN, type LedgerDb } from "../fixtures";

let l: LedgerDb;
let owner: OwnerRepositories;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

beforeAll(async () => {
  l = await createLedgerDb();
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
});

afterAll(async () => {
  await l?.close();
});

describe("corrections PIN on Drizzle", () => {
  it("reports the PIN as set, with ISO times, and changes it only with the current one", async () => {
    expect(await owner.corrections.status()).toEqual({ pinSet: true, pinSetAt: null, lockedUntil: null, setupUntil: null });
    expect(await owner.corrections.setPin("135790", "000000")).toEqual({ ok: false, triesLeft: 4, lockedUntil: null });
    expect(await owner.corrections.setPin("135790", PIN)).toEqual({ ok: true, value: undefined });
    expect((await owner.corrections.status()).pinSetAt).toMatch(ISO);
    // Back to the fixture's PIN for the other tests.
    await owner.corrections.setPin(PIN, "135790");
  });

  it("returns when corrections unlock after the 5th wrong PIN in a row", async () => {
    for (let i = 0; i < 4; i++) await owner.corrections.setPin("135790", "000000");
    const fifth = await owner.corrections.setPin("135790", "000000");
    expect(fifth).toMatchObject({ ok: false, triesLeft: 0 });
    expect(fifth.ok ? null : fifth.lockedUntil).toMatch(ISO);
    expect((await owner.corrections.status()).lockedUntil).toMatch(ISO);
    // Locked: refused (409) even with the right PIN.
    await expect(owner.corrections.setPin("135790", PIN)).rejects.toMatchObject({ status: 409 });
    await l.pg.exec(`update correction_guard set locked_until = null, failed_attempts = 0, failures_today = 0`);
  });

  it("sets a first PIN only while setup is open", async () => {
    await l.pg.exec(`update correction_guard set pin_hash = null, pin_salt = null, pin_set_at = null, setup_until = null`);
    expect(await owner.corrections.status()).toEqual({ pinSet: false, pinSetAt: null, lockedUntil: null, setupUntil: null });
    await expect(owner.corrections.setPin(PIN, null)).rejects.toMatchObject({ status: 409 });

    await l.pg.exec(`update correction_guard set setup_until = now() + interval '15 minutes'`);
    expect((await owner.corrections.status()).setupUntil).toMatch(ISO);
    expect(await owner.corrections.setPin(PIN, null)).toEqual({ ok: true, value: undefined });
    expect(await owner.corrections.status()).toMatchObject({ pinSet: true, setupUntil: null });
  });
});

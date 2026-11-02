// The ledger writes on Drizzle call the SQL functions that stay in Postgres
// (create_payment, create_adjustment, D4). The logic is theirs; what these
// tests pin is the call: every argument lands in the right column, the
// functions' own errors (BBK00/04/09) reach the caller with their status and
// message, and the confirm-link rotation touches only the token columns.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { OwnerRepositories } from "@/server/ports";
import { asService, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "../fixtures";

const PAYMENT = "00000000-0000-4000-8000-0000000000f1";
const ADJUSTMENT = "00000000-0000-4000-8000-0000000000f2";

let l: LedgerDb;
let owner: OwnerRepositories;
let stranger: OwnerRepositories;
let asha: string;
let months: { id: string; period_month: string }[];

beforeAll(async () => {
  l = await createLedgerDb();
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER });
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
  await l.bill([asha], "2026-03-01");
  months = await l.months(asha);
});

afterAll(async () => {
  await l?.close();
});

const payment = (id = PAYMENT) => ({
  id,
  tenant_id: asha,
  amount: 7000,
  payment_date: "2026-02-05",
  mode: "upi" as const,
  note: "Feb + part of Mar",
  owner_signature_path: `payments/${asha}/${id}/owner.png`,
  token_hash: `hash-${id}`,
  token_expires_at: "2026-12-31T00:00:00.000Z",
});

describe("ledger writes on Drizzle call the SQL functions", () => {
  it("records a payment, its allocations and proofs, each argument in its column", async () => {
    const proofs = [
      { storage_path: `payments/${asha}/${PAYMENT}/proofs/1-a.jpg`, file_name: "a.jpg", content_type: "image/jpeg" as const, size_bytes: 10 },
    ];
    await owner.payments.create(
      payment(),
      [
        { rent_period_id: months[0].id, amount: 5000 },
        { rent_period_id: months[1].id, amount: 2000 },
      ],
      proofs
    );
    expect(await owner.payments.get(PAYMENT)).toMatchObject({
      tenant_id: asha,
      amount: 7000,
      payment_date: "2026-02-05",
      mode: "upi",
      note: "Feb + part of Mar",
      owner_signature_path: `payments/${asha}/${PAYMENT}/owner.png`,
      token_hash: `hash-${PAYMENT}`,
      token_expires_at: "2026-12-31T00:00:00+00:00",
      status: "confirmed",
      recorded_by: OWNER,
    });
    expect((await owner.payments.listAllocations(PAYMENT)).map((a) => a.amount_allocated).sort()).toEqual([2000, 5000]);
    expect(await owner.payments.listProofs([PAYMENT])).toMatchObject([{ file_name: "a.jpg", size_bytes: 10 }]);
    expect((await owner.rentPeriods.listByIds([months[1].id]))[0].amount_allocated).toBe(2000);
  });

  it("passes the functions' own refusals through with their status and message", async () => {
    // Allocations that don't add up to the amount: BBK00 -> 400.
    const bad = owner.payments.create(payment("00000000-0000-4000-8000-0000000000f9"), [{ rent_period_id: months[2].id, amount: 1 }]);
    await expect(bad).rejects.toMatchObject({ status: 400 });
    // The same id again: a duplicate key, 409.
    await expect(
      owner.payments.create({ ...payment(), amount: 3000 }, [{ rent_period_id: months[2].id, amount: 3000 }])
    ).rejects.toMatchObject({ status: 409 });
    // Anyone but the owner: BBK04 -> 404, as through the Supabase adapter.
    await expect(
      stranger.payments.create(payment("00000000-0000-4000-8000-0000000000fa"), [{ rent_period_id: months[2].id, amount: 7000 }])
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records an adjustment against the payment, the tenant taken from it", async () => {
    await owner.adjustments.create(
      {
        id: ADJUSTMENT,
        original_payment_id: PAYMENT,
        delta_amount: -500,
        reason: "Counted twice",
        owner_signature_path: `payments/${asha}/${ADJUSTMENT}/owner.png`,
        token_hash: `hash-${ADJUSTMENT}`,
        token_expires_at: "2026-12-31T00:00:00.000Z",
      },
      [{ rent_period_id: months[1].id, amount: -500 }]
    );
    expect(await owner.adjustments.get(ADJUSTMENT)).toMatchObject({
      tenant_id: asha,
      original_payment_id: PAYMENT,
      delta_amount: -500,
      reason: "Counted twice",
      status: "confirmed",
    });
    expect((await owner.rentPeriods.listByIds([months[1].id]))[0].amount_allocated).toBe(1500);
    // Outside the original payment's months: refused.
    await expect(
      owner.adjustments.create(
        {
          id: "00000000-0000-4000-8000-0000000000fb",
          original_payment_id: PAYMENT,
          delta_amount: 100,
          reason: "x",
          owner_signature_path: "p.png",
          token_hash: "hash-fb",
          token_expires_at: "2026-12-31T00:00:00.000Z",
        },
        [{ rent_period_id: months[2].id, amount: 100 }]
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rotates a confirm link's token only until the tenant acknowledges, and only those columns", async () => {
    const before = await owner.payments.get(PAYMENT);
    expect(await owner.payments.rotateToken(PAYMENT, "hash-new", "2027-01-31T00:00:00.000Z")).toBe(true);
    const after = await owner.payments.get(PAYMENT);
    expect(after).toEqual({ ...before, token_hash: "hash-new", token_expires_at: "2027-01-31T00:00:00+00:00" });
    expect(await owner.adjustments.rotateToken(ADJUSTMENT, "hash-adj-new", "2027-01-31T00:00:00.000Z")).toBe(true);
    await l.rows(asService, sql`update payments set acknowledged_at = now() where id = ${PAYMENT}::uuid`);
    expect(await owner.payments.rotateToken(PAYMENT, "hash-late", "2027-02-28T00:00:00.000Z")).toBe(false);
    expect(await stranger.adjustments.rotateToken(ADJUSTMENT, "hash-x", "2027-02-28T00:00:00.000Z")).toBe(false);
  });
});

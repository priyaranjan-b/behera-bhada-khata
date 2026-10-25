import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry } from "@/lib/types";
import { AUDIT_LIMITS } from "@/lib/validation";
import { OWNER_ID, fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { listActivity, recordEvent, tenantHistory, unitHistory } = await import("@/server/services/audit");
const { paymentReceipt, resendPaymentLink } = await import("@/server/services/payments");
const { signInWithPassword, signOut } = await import("@/server/services/auth");
const { changePassword } = await import("@/server/services/profile");

const ctx = { ownerId: OWNER_ID };
const TENANT = "00000000-0000-4000-8000-000000000101";
const PAYMENT = "00000000-0000-4000-8000-000000000201";

function row(id: number, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id,
    at: "2026-10-24T05:00:00Z",
    tx_id: id,
    actor_id: OWNER_ID,
    actor_kind: "owner",
    action: "tenant.updated",
    entity_type: "tenant",
    entity_id: TENANT,
    tenant_id: TENANT,
    unit_code: null,
    property_code: null,
    changes: { phone: ["+919876543210", "+919800000000"] },
    context: {},
    ...overrides,
  };
}

beforeEach(() => {
  resetFakes();
});

describe("reading history", () => {
  it("names the owner and the tenant, newest first", async () => {
    fakes.state.audit.push(row(1), row(2, { actor_kind: "system", actor_id: null }));
    const { entries, nextBefore } = await listActivity(ctx, {});
    expect(entries.map((e) => [e.id, e.actorName, e.tenantName])).toEqual([
      [2, "System", "Asha"],
      [1, "Ramesh Sahu", "Asha"],
    ]);
    expect(nextBefore).toBeNull();
  });

  it("pages by id and filters by category", async () => {
    for (let id = 1; id <= AUDIT_LIMITS.pageSize + 5; id++) fakes.state.audit.push(row(id));
    fakes.state.audit.push(row(100, { action: "rent_rate.changed" }));

    const first = await listActivity(ctx, {});
    expect(first.entries).toHaveLength(AUDIT_LIMITS.pageSize);
    const second = await listActivity(ctx, { before: String(first.nextBefore) });
    // 100 and 55..7 fill the first page.
    expect(second.entries.map((e) => e.id)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(second.nextBefore).toBeNull();

    const rent = await listActivity(ctx, { category: "rent" });
    expect(rent.entries.map((e) => e.action)).toEqual(["rent_rate.changed"]);
  });

  it("rejects a bad filter, and 404s an unknown tenant or house", async () => {
    await expect(listActivity(ctx, { category: "everything" })).rejects.toMatchObject({ status: 400 });
    await expect(listActivity(ctx, { from: "2026-10-10", to: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(tenantHistory(ctx, "not-a-uuid", {})).rejects.toMatchObject({ status: 404 });
    await expect(unitHistory(ctx, "nonsense", {})).rejects.toMatchObject({ status: 404 });
    fakes.owner.units.list.mockResolvedValueOnce([]);
    await expect(unitHistory(ctx, "AC-T1-G09", {})).rejects.toMatchObject({ status: 404 });
  });

  it("reads one tenant's or one house's history", async () => {
    fakes.state.audit.push(row(1), row(2, { tenant_id: null, unit_code: "AC-T1-G01", action: "unit.updated" }));
    expect((await tenantHistory(ctx, TENANT, {})).entries.map((e) => e.id)).toEqual([1]);
    expect((await unitHistory(ctx, "ac-t1-g01", {})).entries.map((e) => e.id)).toEqual([2]);
  });
});

describe("app events", () => {
  it("never lets a failing audit write break the action", async () => {
    fakes.owner.audit.log.mockRejectedValueOnce(new Error("db down"));
    await expect(recordEvent(fakes.owner, { action: "receipt.downloaded" })).resolves.toBeUndefined();
    fakes.owner.audit.log.mockRejectedValueOnce(new Error("db down"));
    expect(await resendPaymentLink(ctx, PAYMENT)).toEqual({ notified: true });
  });

  it("logs every link sent to a tenant, delivered or not, without the message", async () => {
    await resendPaymentLink(ctx, PAYMENT);
    fakes.messaging.send.mockResolvedValueOnce({ delivered: false });
    await resendPaymentLink(ctx, PAYMENT);
    expect(fakes.state.audit.map((e) => [e.action, e.tenant_id, e.entity_id, e.context])).toEqual([
      ["message.sent", TENANT, PAYMENT, { channel: "both", delivered: true, receiptNo: "2026/03/001" }],
      ["message.sent", TENANT, PAYMENT, { channel: "both", delivered: false, receiptNo: "2026/03/001" }],
    ]);
  });

  it("logs receipt downloads", async () => {
    await paymentReceipt(ctx, PAYMENT);
    expect(fakes.state.audit).toMatchObject([
      { action: "receipt.downloaded", actor_kind: "owner", entity_type: "payment", context: { receiptNo: "2026/03/001" } },
    ]);
  });

  it("logs sign-ins and failed attempts without the email or IP", async () => {
    const meta = { ip: "203.0.113.7" };
    await signInWithPassword({ email: "owner@example.com", password: "correct-horse" }, meta);
    await expect(signInWithPassword({ email: "owner@example.com", password: "nope" }, meta)).rejects.toMatchObject({
      status: 400,
    });
    fakes.auth.getSession.mockResolvedValueOnce({ userId: "someone-else", isOwner: false } as never);
    await expect(
      signInWithPassword({ email: "owner@example.com", password: "correct-horse" }, meta)
    ).rejects.toMatchObject({ status: 403 });

    expect(fakes.state.audit.map((e) => [e.action, e.actor_kind, e.actor_id, e.context.reason ?? null])).toEqual([
      ["auth.sign_in", "owner", OWNER_ID, null],
      ["auth.sign_in_failed", "visitor", null, "wrong_password"],
      ["auth.sign_in_failed", "visitor", null, "not_owner"],
    ]);
    const logged = JSON.stringify(fakes.state.audit);
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("owner@example.com");
    expect(logged).not.toContain("nope");
  });

  it("logs a password change and signing out", async () => {
    await changePassword(ctx, { password: "a-new-password", confirmPassword: "a-new-password" });
    await signOut();
    expect(fakes.state.audit.map((e) => [e.action, e.actor_kind])).toEqual([
      ["auth.password_changed", "owner"],
      ["auth.signed_out", "owner"],
    ]);
  });
});

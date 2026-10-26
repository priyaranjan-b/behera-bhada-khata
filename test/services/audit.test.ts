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
    title: "Tenant details changed",
    details: "Phone: +919876543210 → +919800000000",
    actor_name: "Ramesh Sahu",
    ...overrides,
  };
}

beforeEach(() => {
  resetFakes();
});

describe("reading history", () => {
  it("names the owner and the tenant, newest first", async () => {
    fakes.state.audit.push(row(1), row(2, { actor_kind: "system", actor_id: null, actor_name: "System" }));
    const { entries, total, all } = await listActivity(ctx, {});
    expect(entries.map((e) => [e.id, e.actorName, e.tenantName, e.title, e.details])).toEqual([
      [2, "System", "Asha", "Tenant details changed", "Phone: +919876543210 → +919800000000"],
      [1, "Ramesh Sahu", "Asha", "Tenant details changed", "Phone: +919876543210 → +919800000000"],
    ]);
    expect([total, all]).toEqual([2, 2]);
  });

  it("pages Activity over the whole log in the database, with the tenant name searchable and sortable", async () => {
    for (let id = 1; id <= 25; id++) fakes.state.audit.push(row(id));
    fakes.state.audit.push(row(26, { tenant_id: null, unit_code: "AC-T1-G01", action: "unit.updated" }));
    const first = await listActivity(ctx, {});
    expect(first).toMatchObject({ total: 26, all: 26, page: 0 });
    expect(first.entries).toHaveLength(10);
    expect(fakes.owner.audit.historyPage).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: undefined, page: 0, pageSize: 10 }));

    await listActivity(ctx, {
      category: "rent",
      sort: "tenantName",
      dir: "asc",
      filters: JSON.stringify([{ field: "tenantName", operator: "contains", value: "asha" }]),
    });
    expect(fakes.owner.audit.historyPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantId: undefined,
        actions: expect.arrayContaining(["rent_rate.changed"]),
        sort: "tenant_name",
        dir: "asc",
        filters: [{ field: "tenant_name", operator: "contains", value: "asha" }],
      })
    );
  });

  it("pages a house's History dialog by id, 50 at a time", async () => {
    const unit = { tenant_id: null, unit_code: "AC-T1-G01", action: "unit.updated" as const };
    for (let id = 1; id <= AUDIT_LIMITS.pageSize + 5; id++) fakes.state.audit.push(row(id, unit));
    const first = await unitHistory(ctx, "AC-T1-G01", {});
    expect(first.entries).toHaveLength(AUDIT_LIMITS.pageSize);
    const second = await unitHistory(ctx, "AC-T1-G01", { before: String(first.nextBefore) });
    expect(second.entries.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
    expect(second.nextBefore).toBeNull();
  });

  it("rejects a bad filter, and 404s an unknown tenant or house", async () => {
    await expect(listActivity(ctx, { category: "everything" })).rejects.toMatchObject({ status: 400 });
    await expect(listActivity(ctx, { from: "2026-10-10", to: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(listActivity(ctx, { pageSize: "1000" })).rejects.toMatchObject({ status: 400 });
    await expect(tenantHistory(ctx, "not-a-uuid", {})).rejects.toMatchObject({ status: 404 });
    await expect(unitHistory(ctx, "nonsense", {})).rejects.toMatchObject({ status: 404 });
    fakes.owner.units.list.mockResolvedValueOnce([]);
    await expect(unitHistory(ctx, "AC-T1-G09", {})).rejects.toMatchObject({ status: 404 });
  });

  it("reads one tenant's or one house's history", async () => {
    fakes.state.audit.push(row(1), row(2, { tenant_id: null, unit_code: "AC-T1-G01", action: "unit.updated" }));
    expect(await tenantHistory(ctx, TENANT, {})).toMatchObject({ entries: [{ id: 1 }], total: 1, all: 1, page: 0 });
    expect((await unitHistory(ctx, "ac-t1-g01", {})).entries.map((e) => e.id)).toEqual([2]);
  });
});

describe("a tenant's Change history table (A14)", () => {
  const ids = (page: { entries: { id: number }[] }) => page.entries.map((e) => e.id);

  it("asks the database for one page, 10 newest first by default, and returns its counts", async () => {
    for (let id = 1; id <= 25; id++) fakes.state.audit.push(row(id));
    const first = await tenantHistory(ctx, TENANT, {});
    expect(fakes.owner.audit.historyPage).toHaveBeenLastCalledWith({
      tenantId: TENANT,
      actions: undefined,
      fromDate: undefined,
      toDate: undefined,
      search: undefined,
      filters: [],
      logic: "and",
      sort: "at",
      dir: "desc",
      page: 0,
      pageSize: 10,
    });
    expect(first).toMatchObject({ total: 25, all: 25, page: 0 });
    expect(ids(first)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    expect(first.entries[0]).toMatchObject({ title: "Tenant details changed", actorName: "Ramesh Sahu", tenantName: "Asha" });
    expect(ids(await tenantHistory(ctx, TENANT, { page: "2" }))).toEqual([5, 4, 3, 2, 1]);
  });

  it("passes search, Show, dates, sort and column filters through, as database columns", async () => {
    const filters = JSON.stringify([
      { field: "actorName", operator: "equals", value: "System" },
      { field: "unitCode", operator: "isNotEmpty" },
    ]);
    await tenantHistory(ctx, TENANT, {
      q: " monthly rent ",
      category: "rent",
      from: "2026-09-01",
      to: "2026-10-31",
      sort: "actorName",
      dir: "asc",
      filters,
      logic: "or",
      page: "1",
      pageSize: "25",
    });
    expect(fakes.owner.audit.historyPage).toHaveBeenLastCalledWith({
      tenantId: TENANT,
      actions: expect.arrayContaining(["rent_rate.changed", "rent_period.repriced"]),
      fromDate: "2026-09-01",
      toDate: "2026-10-31",
      search: "monthly rent",
      filters: [
        { field: "actor_name", operator: "equals", value: "System" },
        { field: "unit_code", operator: "isNotEmpty" },
      ],
      logic: "or",
      sort: "actor_name",
      dir: "asc",
      page: 1,
      pageSize: 25,
    });
  });

  it("shows what the database matched, and nothing it didn't", async () => {
    fakes.state.audit.push(
      row(1, { action: "rent_rate.changed", title: "Rent changed", details: "Monthly rent: ₹8,000.00 → ₹9,000.00" }),
      row(2)
    );
    expect(ids(await tenantHistory(ctx, TENANT, { q: "monthly rent" }))).toEqual([1]);
    expect(await tenantHistory(ctx, TENANT, { q: "nothing like this" })).toMatchObject({ entries: [], total: 0, all: 2 });
  });

  it("rejects a bad page size, sort or filter, and 404s an unknown tenant", async () => {
    await expect(tenantHistory(ctx, TENANT, { pageSize: "7" })).rejects.toMatchObject({ status: 400 });
    await expect(tenantHistory(ctx, TENANT, { sort: "changes" })).rejects.toMatchObject({ status: 400 });
    await expect(tenantHistory(ctx, TENANT, { filters: "{nope" })).rejects.toMatchObject({ status: 400 });
    const unknownField = JSON.stringify([{ field: "changes", operator: "contains", value: "x" }]);
    await expect(tenantHistory(ctx, TENANT, { filters: unknownField })).rejects.toMatchObject({ status: 400 });
    await expect(tenantHistory(ctx, "00000000-0000-4000-8000-000000000999", {})).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.audit.historyPage).not.toHaveBeenCalled();
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

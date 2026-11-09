// The tenant portal's sign-in (A32): phone + SMS code, its own session, and
// who may open which tenancy.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakes, resetFakes, tenant, withoutTwilio } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { endTenantSession, getTenantContext, listTenancies, selectTenancy, sendTenantOtp, signOutTenant, verifyTenantOtp } =
  await import("@/server/services/tenantAuth");
const { hashToken } = await import("@/server/token");

const meta = { ip: "203.0.113.7" };
const { addMonthsToKey, currentMonthKey } = await import("@/lib/dates");
/** A move-out date `n` months before this month (the 15th), so the test never ages. */
const monthsAgo = (n: number) => addMonthsToKey(currentMonthKey(), -n).replace(/-01$/, "-15");
const ASHA = "00000000-0000-4000-8000-000000000101";
const OTHER = "00000000-0000-4000-8000-000000000102";
const PHONE = "+919876543210";

beforeEach(() => {
  resetFakes();
});

/** Signs in as the tenant(s) with PHONE; returns the new session. */
async function signIn() {
  const result = await verifyTenantOtp({ phone: "98765 43210", code: "123456" }, meta);
  const session = [...fakes.state.tenantSessions.values()].at(-1)!;
  return { result, session };
}

describe("sendTenantOtp", () => {
  it("texts a code to a tenant's number, typed any common way", async () => {
    expect(await sendTenantOtp({ phone: "098765-43210" }, meta)).toEqual({});
    expect(fakes.messaging.sendOtp).toHaveBeenCalledWith(PHONE);
  });

  it("answers the same for a number no tenant has, and sends nothing", async () => {
    expect(await sendTenantOtp({ phone: "+919999999999" }, meta)).toEqual({});
    expect(fakes.messaging.sendOtp).not.toHaveBeenCalled();
  });

  it("never texts a draft's number", async () => {
    fakes.state.tenants.set(ASHA, tenant({ status: "draft" }));
    await sendTenantOtp({ phone: PHONE }, meta);
    expect(fakes.messaging.sendOtp).not.toHaveBeenCalled();
  });

  it("refuses a malformed number before anything else", async () => {
    await expect(sendTenantOtp({ phone: "12ab" }, meta)).rejects.toMatchObject({ status: 400 });
    expect(fakes.system.rateLimits.hit).not.toHaveBeenCalled();
  });

  it("is rate limited per number (15 minutes, hour, day) and per client, with neither in a key", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(sendTenantOtp({ phone: PHONE }, meta)).rejects.toMatchObject({ status: 429 });
    expect(fakes.messaging.sendOtp).not.toHaveBeenCalled();
    const keys = fakes.system.rateLimits.hit.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(keys.map((k) => k.replace(/:[0-9a-f]{24}$/, ":<hash>"))).toEqual([
      "tenant-otp:phone:<hash>",
      "tenant-otp-hour:phone:<hash>",
      "tenant-otp-day:phone:<hash>",
      "tenant-otp:ip:<hash>",
    ]);
    // Never the number or the IP, nor a plain (brute-forceable) sha256 of them.
    expect(keys.join(" ")).not.toMatch(/9876543210|203\.0\.113\.7/);
    expect(keys.join(" ")).not.toContain(hashToken(PHONE).slice(0, 24));
  });

  it("counts the cap on all codes only for a code actually sent, after the response", async () => {
    await sendTenantOtp({ phone: "+919999999999" }, meta);
    const hits = () => fakes.system.rateLimits.hit.mock.calls.map((c) => (c as unknown[])[0]);
    expect(hits()).not.toContain("tenant-otp-day");

    await sendTenantOtp({ phone: PHONE }, meta);
    await Promise.all(fakes.state.afterTasks);
    expect(fakes.afterResponse.run).toHaveBeenCalledTimes(1);
    expect(hits()).toContain("tenant-otp-day");
    expect(fakes.messaging.sendOtp).toHaveBeenCalledWith(PHONE);
  });

  it("sends nothing past the cap on all codes, and answers the same", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakes.system.rateLimits.hit.mockImplementation((async (key: string) => key !== "tenant-otp-day") as never);
    expect(await sendTenantOtp({ phone: PHONE }, meta)).toEqual({});
    await Promise.all(fakes.state.afterTasks);
    expect(fakes.messaging.sendOtp).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("answers the same when Twilio fails: the failure is only logged, without its message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakes.messaging.sendOtp.mockRejectedValueOnce(Object.assign(new Error("Invalid parameter To: +919876543210"), { code: 21211 }));
    expect(await sendTenantOtp({ phone: PHONE }, meta)).toEqual({});
    await Promise.all(fakes.state.afterTasks);
    expect(JSON.stringify(error.mock.calls)).not.toContain("9876543210");
    expect(JSON.stringify(error.mock.calls)).toContain("21211");
    error.mockRestore();
  });

  it("never texts a tenant who moved out longer ago than the portal stays open", async () => {
    fakes.state.tenants.set(ASHA, tenant({ status: "inactive", moved_out_on: monthsAgo(13) }));
    await sendTenantOtp({ phone: PHONE }, meta);
    expect(fakes.afterResponse.run).not.toHaveBeenCalled();
  });

  it("is unavailable without Twilio, unless in development with ALLOW_DEV_LOGIN", async () => {
    await withoutTwilio();
    await expect(sendTenantOtp({ phone: PHONE }, meta)).rejects.toMatchObject({ status: 503 });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_LOGIN", "1");
    (await import("@/server/env")).resetEnvCacheForTests();
    expect(await sendTenantOtp({ phone: PHONE }, meta)).toEqual({ devCode: "000000" });
  });
});

describe("verifyTenantOtp", () => {
  it("signs in: a hashed session for that tenancy, an HttpOnly cookie, any owner session ended", async () => {
    const { result, session } = await signIn();
    expect(result).toEqual({ next: "/tenant" });
    expect(fakes.messaging.checkOtp).toHaveBeenCalledWith(PHONE, "123456");
    expect(session).toMatchObject({ phone: PHONE, tenant_id: ASHA, revoked_at: null });
    // Only the hash is stored; the cookie holds the token.
    expect(fakes.state.tenantCookie).toBeTruthy();
    expect(session.token_hash).toBe(hashToken(fakes.state.tenantCookie!));
    expect(session.token_hash).not.toBe(fakes.state.tenantCookie);
    expect(new Date(session.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
    expect(fakes.auth.signOut).toHaveBeenCalled();
    expect(fakes.state.audit.at(-1)).toMatchObject({ action: "auth.sign_in", actor_kind: "tenant", tenant_id: ASHA });
  });

  it("takes as long to refuse an unknown number as a wrong code", async () => {
    const started = Date.now();
    await expect(verifyTenantOtp({ phone: "+919999999999", code: "111111" }, meta)).rejects.toMatchObject({ status: 400 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(780);
  });

  it("refuses a wrong code with the same answer as an unknown number, which never reaches Twilio", async () => {
    fakes.messaging.checkOtp.mockResolvedValueOnce(false);
    const wrong = await verifyTenantOtp({ phone: PHONE, code: "111111" }, meta).catch((e: unknown) => e);
    const unknown = await verifyTenantOtp({ phone: "+919999999999", code: "111111" }, meta).catch((e: unknown) => e);
    expect(wrong).toMatchObject({ status: 400 });
    expect(unknown).toMatchObject({ status: 400, message: (wrong as Error).message });
    expect(fakes.messaging.checkOtp).toHaveBeenCalledTimes(1);
    expect(fakes.state.tenantSessions.size).toBe(0);
    expect(fakes.state.tenantCookie).toBeNull();
    expect(fakes.state.audit.at(-1)).toMatchObject({ action: "auth.sign_in_failed", actor_kind: "visitor" });
  });

  it("refuses a code that isn't 6 digits", async () => {
    await expect(verifyTenantOtp({ phone: PHONE, code: "12345" }, meta)).rejects.toMatchObject({ status: 400 });
    expect(fakes.messaging.checkOtp).not.toHaveBeenCalled();
  });

  it("is rate limited before the code is checked", async () => {
    fakes.state.rateLimitAllows = false;
    await expect(verifyTenantOtp({ phone: PHONE, code: "123456" }, meta)).rejects.toMatchObject({ status: 429 });
    expect(fakes.messaging.checkOtp).not.toHaveBeenCalled();
  });

  it("lets a moved-out tenant in for a year (their receipts stay theirs), then not", async () => {
    fakes.state.tenants.set(ASHA, tenant({ status: "inactive", moved_out_on: monthsAgo(3) }));
    expect((await signIn()).result).toEqual({ next: "/tenant" });
    fakes.state.tenants.set(ASHA, tenant({ status: "inactive", moved_out_on: monthsAgo(13) }));
    await expect(verifyTenantOtp({ phone: PHONE, code: "123456" }, meta)).rejects.toMatchObject({ status: 400 });
  });

  it("treats a Twilio failure while checking as a wrong code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakes.messaging.checkOtp.mockRejectedValueOnce(new Error("down"));
    await expect(verifyTenantOtp({ phone: PHONE, code: "123456" }, meta)).rejects.toMatchObject({ status: 400 });
    error.mockRestore();
  });

  it("sends a phone with several tenancies to the picker, with none chosen yet", async () => {
    fakes.state.tenants.set(OTHER, tenant({ id: OTHER, name: "Asha Stores", tenant_kind: "business" }));
    const { result, session } = await signIn();
    expect(result).toEqual({ next: "/tenant/select" });
    expect(session.tenant_id).toBeNull();
    await expect(getTenantContext()).rejects.toMatchObject({ status: 403 });
  });
});

describe("getTenantContext", () => {
  it("is the signed-in tenancy", async () => {
    const { session } = await signIn();
    expect(await getTenantContext()).toEqual({ sessionId: session.id, tenantId: ASHA });
  });

  it("is 401 without a cookie, or with one that matches no live session", async () => {
    await expect(getTenantContext()).rejects.toMatchObject({ status: 401 });
    fakes.state.tenantCookie = "made-up-token";
    await expect(getTenantContext()).rejects.toMatchObject({ status: 401 });
  });

  it("ends the session once the owner changes the tenant's phone", async () => {
    const { session } = await signIn();
    fakes.state.tenants.set(ASHA, tenant({ phone: "+919811111111" }));
    await expect(getTenantContext()).rejects.toMatchObject({ status: 401 });
    expect(session.revoked_at).not.toBeNull();
    expect(fakes.state.tenantCookie).toBeNull();
  });

  it("ends a moved-out tenant's session once the portal has closed for them", async () => {
    const { session } = await signIn();
    fakes.state.tenants.set(ASHA, tenant({ status: "inactive", moved_out_on: monthsAgo(13) }));
    await expect(getTenantContext()).rejects.toMatchObject({ status: 401 });
    expect(session.revoked_at).not.toBeNull();
  });

  it("refuses an expired session", async () => {
    const { session } = await signIn();
    session.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(getTenantContext()).rejects.toMatchObject({ status: 401 });
  });
});

describe("selectTenancy", () => {
  beforeEach(() => {
    fakes.state.tenants.set(OTHER, tenant({ id: OTHER, name: "Asha Stores", tenant_kind: "business" }));
  });

  it("lists and opens only the phone's own tenancies", async () => {
    await signIn();
    const tenancies = await listTenancies();
    expect(tenancies.map((t) => t.id)).toEqual([ASHA, OTHER]);
    // Each with its houses, so two tenancies of one person tell apart.
    expect(tenancies[0].unitCodes).toEqual(["AC-T1-G01", "AC-T1-G02"]);
    expect(await selectTenancy({ tenantId: OTHER })).toEqual({ next: "/tenant" });
    expect((await getTenantContext()).tenantId).toBe(OTHER);
  });

  it("refuses another phone's tenancy as not found", async () => {
    const STRANGER = "00000000-0000-4000-8000-000000000103";
    fakes.state.tenants.set(STRANGER, tenant({ id: STRANGER, phone: "+919822222222" }));
    await signIn();
    await expect(selectTenancy({ tenantId: STRANGER })).rejects.toMatchObject({ status: 404 });
  });

  it("needs a session", async () => {
    await expect(selectTenancy({ tenantId: ASHA })).rejects.toMatchObject({ status: 401 });
    await expect(listTenancies()).rejects.toMatchObject({ status: 401 });
  });
});

describe("signing out", () => {
  it("revokes the session and clears the cookie", async () => {
    const { session } = await signIn();
    await signOutTenant();
    expect(session.revoked_at).not.toBeNull();
    expect(fakes.state.tenantCookie).toBeNull();
    expect(fakes.state.audit.at(-1)).toMatchObject({ action: "auth.signed_out", actor_kind: "tenant" });
  });

  it("happens when the owner signs in on the same browser", async () => {
    const { session } = await signIn();
    const { signInWithPassword } = await import("@/server/services/auth");
    await signInWithPassword({ email: "owner@example.com", password: "correct-horse", next: "/" }, meta);
    expect(session.revoked_at).not.toBeNull();
    expect(fakes.state.tenantCookie).toBeNull();
  });

  it("is harmless without a session", async () => {
    await endTenantSession();
    expect(fakes.tenantCookie.clear).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { isCrossSiteWrite, publicRoute } = await import("@/server/http");

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("https://app.test/api/dashboard/payment-notes", { method, headers: { host: "app.test", ...headers } });

describe("isCrossSiteWrite (A31)", () => {
  it("never blocks a read", () => {
    expect(isCrossSiteWrite(req("GET", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("refuses a write a page on another site sent", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "null" }))).toBe(true);
  });

  it("allows the app's own writes and non-browser clients", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSiteWrite(req("PUT", { origin: "https://app.test" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST"))).toBe(false);
  });

  it("trusts Sec-Fetch-Site over Origin", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin", origin: "https://app.test" }))).toBe(false);
  });
});

describe("publicRoute", () => {
  const route = publicRoute(async () => ({ value: 1 }));
  const call = (request: Request) => route(request, { params: Promise.resolve({}) });

  it("answers JSON that nothing may cache", async () => {
    const res = await call(req("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is a 403 for a cross-site write, before the handler runs", async () => {
    const handler = vi.fn(async () => ({}));
    const res = await publicRoute(handler)(req("POST", { "sec-fetch-site": "cross-site" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("tenantRoute and the owner routes, for a tenant session (A32)", async () => {
  const { fakes, resetFakes } = await import("../fakes");
  const { ownerRoute, tenantLinkRoute, tenantRoute } = await import("@/server/http");
  const { verifyTenantOtp } = await import("@/server/services/tenantAuth");
  const call = (route: (r: Request, c: { params: Promise<object> }) => Promise<Response>, method = "GET") =>
    route(req(method), { params: Promise.resolve({}) });

  async function signInAsTenant() {
    resetFakes();
    await verifyTenantOtp({ phone: "+919876543210", code: "123456" }, { ip: "203.0.113.7" });
    // The tenant's browser has no owner session.
    fakes.auth.getSession.mockResolvedValue(null as never);
  }

  it("is a 401 without a tenant session, before the handler runs", async () => {
    resetFakes();
    const handler = vi.fn(async () => ({}));
    expect((await call(tenantRoute(handler))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the handler the session's tenant", async () => {
    await signInAsTenant();
    const handler = vi.fn(async () => ({}));
    expect((await call(tenantRoute(handler))).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "00000000-0000-4000-8000-000000000101" }),
      expect.any(Request),
      {}
    );
  });

  it("sends a link opened without a session to the tenant sign-in", async () => {
    resetFakes();
    const res = await call(tenantLinkRoute(async () => ({})));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/tenant/login");
  });

  it("gives a tenant session nothing on an owner route, read or write", async () => {
    await signInAsTenant();
    const handler = vi.fn(async () => ({}));
    expect((await call(ownerRoute(handler))).status).toBe(401);
    expect((await call(ownerRoute(handler), "POST")).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

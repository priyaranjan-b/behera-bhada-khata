import { describe, expect, it } from "vitest";
import { isProtectedPath, routes } from "./routes";

describe("routes", () => {
  it("builds plain paths", () => {
    expect(routes.tenants.detail("t-1")).toBe("/tenants/t-1");
    expect(routes.properties.newUnit("AC-T1")).toBe("/properties/AC-T1/units/new");
    expect(routes.houses.list()).toBe("/houses");
  });

  it("adds flash and query params, skipping undefined ones", () => {
    expect(routes.tenants.detail("t-1", { saved: "1" })).toBe("/tenants/t-1?saved=1");
    expect(routes.dashboard({ month: "2026-10", show: undefined })).toBe("/?month=2026-10");
    expect(routes.dashboard({ month: "2026-10", show: "unpaid" }, "tenants")).toBe(
      "/?month=2026-10&show=unpaid#tenants"
    );
    expect(routes.login({ error: "owner" })).toBe("/login?error=owner");
  });

  it("encodes path segments", () => {
    expect(routes.tenants.detail("a/b")).toBe("/tenants/a%2Fb");
  });

  it("protects every page but sign-in, the tenant's confirm link and the API (fail closed)", () => {
    for (const path of ["/", "/tenants", "/tenants/t-1/edit", "/properties/AC-T1", "/billing", "/profile", "/some-new-page"]) {
      expect(isProtectedPath(path)).toBe(true);
    }
    for (const path of ["/login", "/auth/callback", "/confirm/abc123", "/api/dashboard/tenants", "/api/confirm/abc"]) {
      expect(isProtectedPath(path)).toBe(false);
    }
    // A look-alike prefix is not public.
    expect(isProtectedPath("/login-history")).toBe(true);
    expect(isProtectedPath("/confirmations")).toBe(true);
  });
});

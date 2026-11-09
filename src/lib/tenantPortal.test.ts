import { describe, expect, it } from "vitest";
import { isTenantAllowedPath } from "./tenantPortal";

describe("isTenantAllowedPath", () => {
  it("lets a tenant browser into the portal, its API, confirm links and the sign-in pages", () => {
    for (const p of ["/tenant", "/tenant/login", "/tenant/select", "/api/tenant/ledger", "/confirm/x", "/login", "/api/auth/password"]) {
      expect(isTenantAllowedPath(p), p).toBe(true);
    }
  });

  it("keeps it out of every owner page and owner API", () => {
    for (const p of ["/", "/tenants", "/tenants/abc", "/tenantsx", "/settings", "/payments", "/api/dashboard/tenants", "/api/cron/x"]) {
      expect(isTenantAllowedPath(p), p).toBe(false);
    }
  });
});

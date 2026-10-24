import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("builds plain paths", () => {
    expect(routes.tenants.detail("t-1")).toBe("/dashboard/tenants/t-1");
    expect(routes.properties.newUnit("AC-T1")).toBe("/dashboard/properties/AC-T1/units/new");
    expect(routes.houses.list()).toBe("/dashboard/houses");
  });

  it("adds flash and query params, skipping undefined ones", () => {
    expect(routes.tenants.detail("t-1", { saved: "1" })).toBe("/dashboard/tenants/t-1?saved=1");
    expect(routes.dashboard({ month: "2026-10", show: undefined })).toBe("/dashboard?month=2026-10");
    expect(routes.dashboard({ month: "2026-10", show: "unpaid" }, "tenants")).toBe(
      "/dashboard?month=2026-10&show=unpaid#tenants"
    );
    expect(routes.login({ error: "owner" })).toBe("/login?error=owner");
  });

  it("encodes path segments", () => {
    expect(routes.tenants.detail("a/b")).toBe("/dashboard/tenants/a%2Fb");
  });
});

import { describe, expect, it } from "vitest";
import { carryPaidDirect, paidDirectQuery, paidDirectViewOf } from "./preferences";

describe("paidDirectViewOf", () => {
  it("is hidden unless the URL says show", () => {
    expect(paidDirectViewOf(undefined)).toBe("hide");
    expect(paidDirectViewOf("hide")).toBe("hide");
    expect(paidDirectViewOf("junk")).toBe("hide");
    expect(paidDirectViewOf(["show", "show"])).toBe("hide");
    expect(paidDirectViewOf("show")).toBe("show");
  });

  it("keeps the param on links only while shown", () => {
    expect(paidDirectQuery("show")).toEqual({ paidDirect: "show" });
    expect(paidDirectQuery("hide")).toEqual({});
  });
});

describe("carryPaidDirect", () => {
  it("keeps the switch on links between report pages while it is on", () => {
    expect(carryPaidDirect("/billing", true, "show")).toBe("/billing?paidDirect=show");
    expect(carryPaidDirect("/payments?from=2026-10-01", true, "show")).toBe("/payments?from=2026-10-01&paidDirect=show");
  });

  it("leaves the link alone when the switch is off or the page doesn't use it", () => {
    expect(carryPaidDirect("/billing", true, null)).toBe("/billing");
    expect(carryPaidDirect("/billing", true, "hide")).toBe("/billing");
    expect(carryPaidDirect("/tenants", false, "show")).toBe("/tenants");
  });
});

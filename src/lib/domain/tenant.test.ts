import { describe, expect, it } from "vitest";
import { formatFloor, formatUnits, unitMix, billingStartFor, isGovernment, isRentTracked, TENANT_KIND_OPTIONS, tenantTypeTags } from "./tenant";

describe("tenant display helpers", () => {
  it("groups house codes by tower", () => {
    expect(formatUnits(["AC-T1-G02", "AC-T2-101", "AC-T1-G01"])).toBe("AC-T1-G01, G02 · AC-T2-101");
    expect(formatUnits(["RM-TS-01"])).toBe("RM-TS-01");
    expect(formatUnits([])).toBe("");
  });

  it("summarises what a tenant rents", () => {
    expect(unitMix(["commercial", "commercial"])).toBe("commercial");
    expect(unitMix(["commercial", "residential"])).toBe("mixed");
    expect(unitMix([])).toBeNull();
  });

  it("names floors", () => {
    expect(formatFloor("G")).toBe("Ground floor");
    expect(formatFloor("2")).toBe("Floor 2");
    expect(formatFloor(null)).toBe("");
  });
});

describe("billingStartFor", () => {
  it("is the month after paid-up-to, never before the lease month", () => {
    expect(billingStartFor("2021-03-11", "2026-07-01")).toBe("2026-08-01");
    expect(billingStartFor("2026-05-20", "2026-01-01")).toBe("2026-05-01");
    expect(billingStartFor("2026-05-20", null)).toBe("2026-05-01");
  });
});

describe("government tenants (0016)", () => {
  it("bills only an active tenant whose rent is tracked", () => {
    expect(isRentTracked({ status: "active", rentTracked: true })).toBe(true);
    expect(isRentTracked({ status: "active", rentTracked: false })).toBe(false);
    expect(isRentTracked({ status: "draft", rentTracked: true })).toBe(false);
    expect(isRentTracked({ status: "inactive", rentTracked: true })).toBe(false);
  });

  it("tags every tenant with its type, and says when the rent is paid direct", () => {
    expect(tenantTypeTags({ tenantKind: "business", rentTracked: true })).toEqual(["Business"]);
    expect(tenantTypeTags({ tenantKind: "government", rentTracked: true })).toEqual(["Government"]);
    expect(tenantTypeTags({ tenantKind: "government", rentTracked: false })).toEqual(["Government", "Rent paid direct"]);
  });

  it("labels every kind, and only government is exempt", () => {
    expect(TENANT_KIND_OPTIONS.map((o) => o.label)).toEqual(["Individual", "Business", "Government"]);
    expect(TENANT_KIND_OPTIONS.filter((o) => isGovernment(o.value)).map((o) => o.value)).toEqual(["government"]);
  });
});

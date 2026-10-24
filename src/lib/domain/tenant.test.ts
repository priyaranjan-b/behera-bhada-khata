import { describe, expect, it } from "vitest";
import { formatFloor, formatUnits, unitMix, billingStartFor } from "./tenant";

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

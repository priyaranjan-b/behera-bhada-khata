import { describe, expect, it } from "vitest";
import { MAINTENANCE_CATEGORIES } from "@/lib/types";
import { MAINTENANCE_CATEGORY_LABELS, isCashExpense, maintenanceCategoryLabel, maintenanceRange } from "./maintenance";

describe("maintenance category labels", () => {
  it("labels every category and falls back to Other", () => {
    for (const c of MAINTENANCE_CATEGORIES) expect(MAINTENANCE_CATEGORY_LABELS[c]).toBeTruthy();
    expect(maintenanceCategoryLabel("plumbing")).toBe("Plumbing");
    expect(maintenanceCategoryLabel("garden")).toBe("Other");
  });
});

describe("maintenanceRange", () => {
  const now = new Date("2026-10-25T06:00:00Z");
  it("defaults to this month, else reads the days like the Payments page", () => {
    expect(maintenanceRange({}, 731, now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(maintenanceRange({ from: "bad" }, 731, now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(maintenanceRange({ from: "2026-03-01" }, 731, now)).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    expect(maintenanceRange({ from: "2026-03-31", to: "2026-03-01" }, 731, now)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });
});

describe("isCashExpense (A22)", () => {
  it("is false only for an expense a set-off paid for", () => {
    expect(isCashExpense({ settledBy: null })).toBe(true);
    expect(isCashExpense({ settledBy: { paymentId: "p-1", receiptNo: null } })).toBe(false);
  });
});

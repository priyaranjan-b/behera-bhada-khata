import { describe, expect, it } from "vitest";
import { MAINTENANCE_CATEGORIES } from "@/lib/types";
import { MAINTENANCE_CATEGORY_LABELS, isCashExpense, maintenanceCategoryLabel, maintenanceRange, splitEqually } from "./maintenance";

describe("splitEqually", () => {
  it("gives the odd paise to the first houses by code", () => {
    expect(splitEqually(1000, ["AC-T1-G03", "AC-T1-G01", "AC-T1-G02"])).toEqual([
      { unitCode: "AC-T1-G01", share: 333.34 },
      { unitCode: "AC-T1-G02", share: 333.33 },
      { unitCode: "AC-T1-G03", share: 333.33 },
    ]);
  });

  it("always adds up to the amount", () => {
    for (const [amount, n] of [
      [0.01, 3],
      [100.05, 4],
      [9999.99, 7],
      [1, 1],
    ] as const) {
      const codes = Array.from({ length: n }, (_, i) => `AC-T1-G0${i + 1}`);
      const total = splitEqually(amount, codes).reduce((s, h) => s + Math.round(h.share * 100), 0);
      expect(total).toBe(Math.round(amount * 100));
    }
  });

  it("counts a house once and shows zero shares without an amount", () => {
    expect(splitEqually(10, ["B", "A", "B"])).toEqual([
      { unitCode: "A", share: 5 },
      { unitCode: "B", share: 5 },
    ]);
    expect(splitEqually(Number.NaN, ["A"])).toEqual([{ unitCode: "A", share: 0 }]);
    expect(splitEqually(10, [])).toEqual([]);
  });
});

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

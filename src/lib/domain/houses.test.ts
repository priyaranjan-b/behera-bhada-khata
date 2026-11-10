import { describe, expect, it } from "vitest";
import {
  defaultRentSplit,
  housesRentWith,
  isVacant,
  matchesHouseFilter,
  parseHouseFilter,
  rentSplitHouses,
  rentSplitProblem,
  splitEqually,
  tenantRentGap,
  totalRent,
} from "./houses";

const vacant = { isActive: true, occupied: false };
const occupied = { isActive: true, occupied: true };
const retired = { isActive: false, occupied: false };

describe("houses filter", () => {
  it("vacant means in use with nobody in it", () => {
    expect(isVacant(vacant)).toBe(true);
    expect(isVacant(occupied)).toBe(false);
    expect(isVacant(retired)).toBe(false);
  });

  it("filters by status", () => {
    const all = [vacant, occupied, retired];
    expect(all.filter((h) => matchesHouseFilter(h, "all"))).toHaveLength(3);
    expect(all.filter((h) => matchesHouseFilter(h, "vacant"))).toEqual([vacant]);
    expect(all.filter((h) => matchesHouseFilter(h, "occupied"))).toEqual([occupied]);
    expect(all.filter((h) => matchesHouseFilter(h, "retired"))).toEqual([retired]);
  });

  it("reads ?show= and falls back to all", () => {
    expect(parseHouseFilter("vacant")).toBe("vacant");
    expect(parseHouseFilter("bogus")).toBe("all");
    expect(parseHouseFilter(undefined)).toBe("all");
  });
});

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

describe("totalRent", () => {
  it("adds in paise and counts a missing rent as zero", () => {
    expect(totalRent([0.1, 0.2])).toBe(0.3);
    expect(totalRent([5000, null, undefined, 2500.5])).toBe(7500.5);
    expect(totalRent([])).toBe(0);
  });
});

describe("defaultRentSplit", () => {
  it("keeps the houses' own rents when they already add up to the rent", () => {
    expect(
      defaultRentSplit(9000, [
        { unitCode: "AC-T1-G02", baseRent: 4000 },
        { unitCode: "AC-T1-G01", baseRent: 5000 },
      ])
    ).toEqual([
      { unitCode: "AC-T1-G01", share: 5000 },
      { unitCode: "AC-T1-G02", share: 4000 },
    ]);
  });

  it("scales them to a new rent, keeping their proportions and adding up to the paisa", () => {
    const houses = [
      { unitCode: "AC-T1-G01", baseRent: 8000 },
      { unitCode: "AC-T1-G02", baseRent: 4000 },
    ];
    expect(defaultRentSplit(13500, houses)).toEqual([
      { unitCode: "AC-T1-G01", share: 9000 },
      { unitCode: "AC-T1-G02", share: 4500 },
    ]);
    const odd = defaultRentSplit(1000, [
      { unitCode: "A", baseRent: 1 },
      { unitCode: "B", baseRent: 1 },
      { unitCode: "C", baseRent: 1 },
    ]);
    expect(odd).toEqual(splitEqually(1000, ["A", "B", "C"]));
    expect(totalRent(defaultRentSplit(9999.99, houses).map((s) => s.share))).toBe(9999.99);
  });

  it("splits equally when a house has no rent", () => {
    expect(
      defaultRentSplit(9000, [
        { unitCode: "AC-T1-G01", baseRent: 9000 },
        { unitCode: "AC-T1-G02", baseRent: null },
      ])
    ).toEqual(splitEqually(9000, ["AC-T1-G01", "AC-T1-G02"]));
  });
});

describe("rentSplitHouses", () => {
  it("is the tenant's houses, none once they've moved out", () => {
    expect(rentSplitHouses({ status: "active" }, ["A", "B"])).toEqual(["A", "B"]);
    expect(rentSplitHouses({ status: "draft" }, ["A"])).toEqual(["A"]);
    expect(rentSplitHouses({ status: "inactive" }, ["A", "B"])).toEqual([]);
  });
});

describe("tenantRentGap and housesRentWith", () => {
  it("is the houses' rents above or below the tenant's, null when they agree or there is no rent", () => {
    expect(tenantRentGap({ monthlyRent: 5000, housesRent: 5500 })).toBe(500);
    expect(tenantRentGap({ monthlyRent: 5000, housesRent: 4000 })).toBe(-1000);
    expect(tenantRentGap({ monthlyRent: 5000, housesRent: 5000 })).toBeNull();
    expect(tenantRentGap({ monthlyRent: 0, housesRent: 5000 })).toBeNull();
  });

  it("changes one house's part of the total, a cleared rent counting as none", () => {
    expect(housesRentWith(5000, 3000, 3500)).toBe(5500);
    expect(housesRentWith(5000, 3000, null)).toBe(2000);
    expect(housesRentWith(0, null, 0.1)).toBe(0.1);
  });
});

describe("rentSplitProblem", () => {
  const codes = ["AC-T1-G01", "AC-T1-G02"];

  it("accepts one share per house adding up to the rent", () => {
    expect(rentSplitProblem(9000, codes, splitEqually(9000, codes))).toBeNull();
    expect(
      rentSplitProblem(1000, ["A", "B", "C"], [
        { unitCode: "A", share: 333.34 },
        { unitCode: "B", share: 333.33 },
        { unitCode: "C", share: 333.33 },
      ])
    ).toBeNull();
  });

  it("refuses a missing, extra or repeated house", () => {
    expect(rentSplitProblem(9000, codes, [{ unitCode: "AC-T1-G01", share: 9000 }])).toMatch(/each of the tenant's houses/);
    expect(
      rentSplitProblem(9000, codes, [
        { unitCode: "AC-T1-G01", share: 4500 },
        { unitCode: "AC-T1-G09", share: 4500 },
      ])
    ).toMatch(/each of the tenant's houses/);
    expect(
      rentSplitProblem(9000, codes, [
        { unitCode: "AC-T1-G01", share: 4500 },
        { unitCode: "AC-T1-G01", share: 4500 },
      ])
    ).toMatch(/each of the tenant's houses/);
  });

  it("refuses a zero share and a total that is off", () => {
    expect(
      rentSplitProblem(9000, codes, [
        { unitCode: "AC-T1-G01", share: 9000 },
        { unitCode: "AC-T1-G02", share: 0 },
      ])
    ).toMatch(/more than zero/);
    expect(
      rentSplitProblem(9000, codes, [
        { unitCode: "AC-T1-G01", share: 4000 },
        { unitCode: "AC-T1-G02", share: 4000 },
      ])
    ).toMatch(/less than the rent/);
    expect(
      rentSplitProblem(9000, codes, [
        { unitCode: "AC-T1-G01", share: 5000 },
        { unitCode: "AC-T1-G02", share: 4500 },
      ])
    ).toMatch(/more than the rent/);
  });
});

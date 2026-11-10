import { describe, expect, it } from "vitest";
import { houseRentsFor, houseRentsOrEqual } from "@/server/services/houseRents";

const both = ["AC-T1-G01", "AC-T1-G02"];

describe("houseRentsFor (D39)", () => {
  it("gives one house the whole rent, rounded, whatever split came with it", () => {
    expect(houseRentsFor(5000.004, ["AC-T1-G01"], undefined)).toEqual([{ unit_code: "AC-T1-G01", base_rent: 5000 }]);
    expect(houseRentsFor(5000, ["AC-T1-G01"], [{ unitCode: "AC-T1-G09", share: 1 }])).toEqual([
      { unit_code: "AC-T1-G01", base_rent: 5000 },
    ]);
  });

  it("sets nothing without a rent or houses", () => {
    expect(houseRentsFor(undefined, both, undefined)).toEqual([]);
    expect(houseRentsFor(0, both, undefined)).toEqual([]);
    expect(houseRentsFor(5000, [], undefined)).toEqual([]);
  });

  it("needs the owner's split for several houses, adding up to the rent", () => {
    expect(() => houseRentsFor(9000, both, undefined)).toThrow(/Split the rent/);
    expect(() =>
      houseRentsFor(9000, both, [
        { unitCode: "AC-T1-G01", share: 5000 },
        { unitCode: "AC-T1-G02", share: 5000 },
      ])
    ).toThrow(/more than the rent/);
    expect(
      houseRentsFor(9000, both, [
        { unitCode: "AC-T1-G01", share: 5000 },
        { unitCode: "AC-T1-G02", share: 4000 },
      ])
    ).toEqual([
      { unit_code: "AC-T1-G01", base_rent: 5000 },
      { unit_code: "AC-T1-G02", base_rent: 4000 },
    ]);
  });
});

describe("houseRentsOrEqual (bulk upload)", () => {
  it("splits equally when no split is given, and still checks one that is", () => {
    expect(houseRentsOrEqual(1000, ["AC-T1-G02", "AC-T1-G01"], undefined)).toEqual([
      { unit_code: "AC-T1-G01", base_rent: 500 },
      { unit_code: "AC-T1-G02", base_rent: 500 },
    ]);
    expect(houseRentsOrEqual(undefined, both, undefined)).toEqual([]);
    expect(() => houseRentsOrEqual(1000, both, [{ unitCode: "AC-T1-G01", share: 1000 }])).toThrow(/each of the tenant's houses/);
  });
});

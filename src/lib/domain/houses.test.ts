import { describe, expect, it } from "vitest";
import { isVacant, matchesHouseFilter, parseHouseFilter } from "./houses";

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

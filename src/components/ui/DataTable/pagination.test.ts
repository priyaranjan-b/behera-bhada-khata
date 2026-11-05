import { describe, expect, it } from "vitest";
import { fitsOnePage } from "./pagination";

describe("fitsOnePage", () => {
  it("is true while the rows fit the smallest page size", () => {
    expect(fitsOnePage(0, 10, [10, 25])).toBe(true);
    expect(fitsOnePage(10, 10, [10, 25])).toBe(true);
    expect(fitsOnePage(11, 10, [10, 25])).toBe(false);
  });

  it("uses the smallest size, not the one picked, so a bigger page size can be undone", () => {
    expect(fitsOnePage(20, 25, [10, 25, 50])).toBe(false);
    expect(fitsOnePage(5, 25, [10, 25, 50])).toBe(true);
  });
});

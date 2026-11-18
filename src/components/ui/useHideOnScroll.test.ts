import { describe, expect, it } from "vitest";
import { nextHideOnScroll } from "./useHideOnScroll";

const MAX = 2000;

describe("nextHideOnScroll", () => {
  it("stays shown near the top of the page", () => {
    expect(nextHideOnScroll({ hidden: false, y: 0 }, 40, MAX)).toEqual({ hidden: false, y: 40 });
    expect(nextHideOnScroll({ hidden: true, y: 300 }, 10, MAX)).toEqual({ hidden: false, y: 10 });
  });

  it("hides scrolling down and shows scrolling up", () => {
    const down = nextHideOnScroll({ hidden: false, y: 100 }, 200, MAX);
    expect(down).toEqual({ hidden: true, y: 200 });
    expect(nextHideOnScroll(down, 150, MAX)).toEqual({ hidden: false, y: 150 });
  });

  it("ignores small jitter", () => {
    const prev = { hidden: true, y: 500 };
    expect(nextHideOnScroll(prev, 495, MAX)).toBe(prev);
  });

  it("shows at the bottom of the page", () => {
    expect(nextHideOnScroll({ hidden: true, y: 1900 }, MAX, MAX)).toEqual({ hidden: false, y: MAX });
  });
});

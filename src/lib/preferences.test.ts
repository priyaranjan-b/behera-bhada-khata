import { describe, expect, it } from "vitest";
import { paidDirectQuery, paidDirectViewOf } from "./preferences";

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

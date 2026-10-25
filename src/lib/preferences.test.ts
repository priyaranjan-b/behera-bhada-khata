import { describe, expect, it } from "vitest";
import { paidDirectViewOf } from "./preferences";

describe("paidDirectViewOf", () => {
  it("is shown unless the cookie says hide", () => {
    expect(paidDirectViewOf(undefined)).toBe("show");
    expect(paidDirectViewOf("show")).toBe("show");
    expect(paidDirectViewOf("junk")).toBe("show");
    expect(paidDirectViewOf("hide")).toBe("hide");
  });
});

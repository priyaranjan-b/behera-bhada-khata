import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("turns the common ways of typing an Indian mobile into E.164", () => {
    for (const typed of ["9876543210", "98765 43210", "098765-43210", "+91 98765 43210", "919876543210", "(987) 654-3210"]) {
      expect(normalizePhone(typed)).toBe("+919876543210");
    }
  });

  it("keeps another country's number and leaves junk for the schema to refuse", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("12ab")).toBe("12ab");
  });
});

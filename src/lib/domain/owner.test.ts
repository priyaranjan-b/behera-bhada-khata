import { describe, expect, it } from "vitest";
import { ownerFullName, ownerInitials } from "./owner";

describe("ownerFullName", () => {
  it("joins what's there", () => {
    expect(ownerFullName("Ramesh", "Sahu")).toBe("Ramesh Sahu");
    expect(ownerFullName(" Ramesh ", null)).toBe("Ramesh");
    expect(ownerFullName(null, null)).toBeNull();
  });
});

describe("ownerInitials", () => {
  it("uses the name, else the email", () => {
    expect(ownerInitials("Ramesh Sahu", "x@example.com")).toBe("RS");
    expect(ownerInitials("Ramesh", null)).toBe("R");
    expect(ownerInitials(null, "priya@example.com")).toBe("P");
    expect(ownerInitials(null, null)).toBe("O");
  });
});

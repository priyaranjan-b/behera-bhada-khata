import { describe, expect, it } from "vitest";
import { safeNext } from "./redirects";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/tenants")).toBe("/tenants");
    expect(safeNext("/?month=2026-10")).toBe("/?month=2026-10");
  });

  it("falls back to the dashboard for anything else", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    expect(safeNext("/\t/evil.test")).toBe("/");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });
});

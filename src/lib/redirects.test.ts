import { describe, expect, it } from "vitest";
import { safeNext } from "./redirects";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/dashboard/tenants")).toBe("/dashboard/tenants");
    expect(safeNext("/dashboard?month=2026-10")).toBe("/dashboard?month=2026-10");
  });

  it("falls back to the dashboard for anything else", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("//evil.test")).toBe("/dashboard");
    expect(safeNext("/\\evil.test")).toBe("/dashboard");
    expect(safeNext("/\t/evil.test")).toBe("/dashboard");
    expect(safeNext("https://evil.test")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});

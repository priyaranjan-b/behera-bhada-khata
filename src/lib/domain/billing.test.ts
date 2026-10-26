import { describe, expect, it } from "vitest";
import {
  monthsIn,
  paidDirectId,
  paidDirectMonths,
  periodDisplayStatus,
  rangeLength,
  rangeQuery,
  rangeFromParams,
  resolveRange,
  shiftRange,
} from "./billing";

describe("resolveRange", () => {
  const today = "2026-10-01";
  it("defaults to the given month, and treats one end alone as a single month", () => {
    expect(resolveRange({}, today, 24)).toEqual({ from: today, to: today });
    expect(resolveRange({ from: "2026-07" }, today, 24)).toEqual({ from: "2026-07-01", to: "2026-07-01" });
    expect(resolveRange({ to: "2026-07" }, today, 24)).toEqual({ from: "2026-07-01", to: "2026-07-01" });
  });

  it("swaps reversed ends and caps the length, keeping the start", () => {
    expect(resolveRange({ from: "2026-09", to: "2026-04" }, today, 24)).toEqual({ from: "2026-04-01", to: "2026-09-01" });
    expect(resolveRange({ from: "2024-01", to: "2026-10" }, today, 12)).toEqual({ from: "2024-01-01", to: "2024-12-01" });
  });
});

describe("rangeFromParams", () => {
  it("drops malformed ends instead of failing", () => {
    expect(rangeFromParams({ from: "2026-13", to: "2026-07" }, "2026-10-01", 24)).toEqual({ from: "2026-07-01", to: "2026-07-01" });
    expect(rangeFromParams({ from: "junk" }, "2026-10-01", 24)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(rangeFromParams({ from: "2026-04", to: "2026-06" }, "2026-10-01", 24)).toEqual({ from: "2026-04-01", to: "2026-06-01" });
  });
});

describe("shiftRange", () => {
  it("moves by the range's own length, across years", () => {
    expect(shiftRange({ from: "2026-01-01", to: "2026-01-01" }, -1)).toEqual({ from: "2025-12-01", to: "2025-12-01" });
    const quarter = { from: "2026-04-01", to: "2026-06-01" };
    expect(rangeLength(quarter)).toBe(3);
    expect(shiftRange(quarter, 1)).toEqual({ from: "2026-07-01", to: "2026-09-01" });
    expect(rangeQuery(quarter)).toEqual({ from: "2026-04", to: "2026-06" });
  });
});

describe("periodDisplayStatus", () => {
  it("shows an unpaid month that hasn't ended as not due yet", () => {
    expect(periodDisplayStatus("pending", true)).toBe("not_due_yet");
    expect(periodDisplayStatus("partially_paid", true)).toBe("not_due_yet");
    expect(periodDisplayStatus("paid", true)).toBe("paid");
    expect(periodDisplayStatus("pending", false)).toBe("pending");
  });
});

describe("paid direct (government rent, 0016)", () => {
  const rates = [
    { effective_month: "2022-01-01", monthly_amount: "5300.00" },
    { effective_month: "2026-09-01", monthly_amount: "5800.00" },
  ];

  it("covers the months from the lease month, at the rent in effect, up to the horizon", () => {
    const months = monthsIn({ from: "2026-07-01", to: "2026-12-01" });
    expect(paidDirectMonths({ leaseStart: "2022-01-10", movedOutOn: null }, rates, months, "2026-11-01")).toEqual([
      { month: "2026-07-01", amount: 5300 },
      { month: "2026-08-01", amount: 5300 },
      { month: "2026-09-01", amount: 5800 },
      { month: "2026-10-01", amount: 5800 },
      { month: "2026-11-01", amount: 5800 },
    ]);
  });

  it("stops at the move-out month, starts at the lease month, and needs a rent on file", () => {
    const months = monthsIn({ from: "2026-01-01", to: "2026-06-01" });
    expect(
      paidDirectMonths({ leaseStart: "2026-03-15", movedOutOn: "2026-04-30" }, rates, months, "2026-12-01").map((m) => m.month)
    ).toEqual(["2026-03-01", "2026-04-01"]);
    expect(paidDirectMonths({ leaseStart: "2026-01-01", movedOutOn: null }, [], months, "2026-12-01")).toEqual([]);
    expect(paidDirectMonths({ leaseStart: null, movedOutOn: null }, rates, months, "2026-12-01")).toEqual([]);
  });

  it("marks its months with an id no uuid can match", () => {
    const id = paidDirectId("t1", "2026-10-01");
    expect(id).toBe("paid-direct:t1:2026-10-01");
    expect(id).not.toMatch(/^[0-9a-f-]{36}$/);
  });
});

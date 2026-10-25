import { describe, expect, it } from "vitest";
import type { TenantRentRate, UnitOccupancy } from "@/lib/types";
import { currentTenancies, holdsUnit, rentByProperty, rentInEffect } from "@/server/services/placements";

const stay = (unit_code: string, start_date: string, end_date: string | null): UnitOccupancy => ({
  unit_code,
  property_code: "AC-T1",
  tenant_id: "t",
  tenant_name: "T",
  tenant_business_name: null,
  start_date,
  end_date,
  is_current: false,
});

const rate = (effective_month: string, monthly_amount: string): TenantRentRate => ({
  id: 1,
  tenant_id: "t",
  effective_month,
  monthly_amount,
  created_at: "",
  recorded_by: null,
});

describe("placements", () => {
  it("treats a house as held until (and including) its last day", () => {
    expect(holdsUnit({ end_date: null }, "2026-03-01")).toBe(true);
    expect(holdsUnit({ end_date: "2026-03-01" }, "2026-03-01")).toBe(true);
    expect(holdsUnit({ end_date: "2026-02-28" }, "2026-03-01")).toBe(false);
  });

  it("returns current houses, or the last ones after a move-out", () => {
    const swapped = [stay("AC-T1-G01", "2026-01-01", "2026-02-28"), stay("AC-T1-G05", "2026-03-01", null)];
    expect(currentTenancies(swapped, "2026-03-10").map((o) => o.unit_code)).toEqual(["AC-T1-G05"]);

    const movedOut = [
      stay("AC-T1-G01", "2025-01-01", "2025-06-30"),
      stay("AC-T1-G02", "2025-07-01", "2026-02-28"),
      stay("AC-T1-G03", "2025-07-01", "2026-02-28"),
    ];
    expect(currentTenancies(movedOut, "2026-03-10").map((o) => o.unit_code)).toEqual(["AC-T1-G02", "AC-T1-G03"]);
  });

  it("uses the rent rate in effect for a month", () => {
    const rates = [rate("2026-06-01", "5500.00"), rate("2026-01-01", "5000.00")];
    expect(rentInEffect(rates, "2026-05-01")).toBe(5000);
    expect(rentInEffect(rates, "2026-06-01")).toBe(5500);
    // A tenant whose lease starts next month shows that first rate.
    expect(rentInEffect([rate("2026-12-01", "7000.00")], "2026-10-01")).toBe(7000);
  });
});

describe("rentByProperty", () => {
  const live = (tenant_id: string, unit_code: string, start_date = "2026-01-01", end_date: string | null = null): UnitOccupancy => ({
    ...stay(unit_code, start_date, end_date),
    tenant_id,
    property_code: unit_code.split("-").slice(0, 2).join("-"),
  });
  const rateOf = (tenant_id: string, monthly_amount: string): TenantRentRate => ({ ...rate("2026-01-01", monthly_amount), tenant_id });

  it("adds up the current occupants' rent per tower, splitting a tenant across towers by house", () => {
    const occupancy = [
      live("a", "AC-T1-G01"),
      live("b", "AC-T1-G02"),
      live("b", "AC-T2-G01"), // b: 9000 across two towers -> 4500 each
      live("c", "AC-T2-G02", "2025-01-01", "2026-01-31"), // moved out
      live("d", "AC-T2-G03", "2026-04-01"), // booked from next month
    ];
    const rates = [rateOf("a", "5000"), rateOf("b", "9000"), rateOf("c", "7000"), rateOf("d", "6000")];
    const rent = rentByProperty(occupancy, rates, "2026-03-15", "2026-03-01");
    expect(Object.fromEntries(rent)).toEqual({ "AC-T1": 9500, "AC-T2": 4500 });
  });
});

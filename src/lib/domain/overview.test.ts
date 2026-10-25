import { describe, expect, it } from "vitest";
import {
  buildAttention,
  buildKindBreakdown,
  buildSiteCollection,
  collectionRateTone,
  rentReviewDue,
} from "./overview";

describe("collectionRateTone", () => {
  it("is good from 90%, a warning from 60%, behind below", () => {
    expect([95, 90, 89, 60, 59, 0].map(collectionRateTone)).toEqual([
      "success",
      "success",
      "warning",
      "warning",
      "danger",
      "danger",
    ]);
  });
});

describe("buildSiteCollection", () => {
  it("splits a tenant across the sites of their houses and lists every site", () => {
    const sites = [
      { code: "AC", name: "Arnapal" },
      { code: "MS", name: "Matha Sahi" },
      { code: "RM", name: "Ram Mandir" },
    ];
    const result = buildSiteCollection(sites, [
      { monthDue: 10000, monthAllocated: 10000, totalOutstanding: 0, siteCodes: ["AC"] },
      { monthDue: 6000, monthAllocated: 0, totalOutstanding: 3000, siteCodes: ["AC", "RM", "RM"] },
    ]);
    expect(result).toEqual([
      { siteCode: "AC", siteName: "Arnapal", expected: 12000, collected: 10000, outstanding: 1000, collectionRate: 83 },
      { siteCode: "MS", siteName: "Matha Sahi", expected: 0, collected: 0, outstanding: 0, collectionRate: null },
      { siteCode: "RM", siteName: "Ram Mandir", expected: 4000, collected: 0, outstanding: 2000, collectionRate: 0 },
    ]);
  });
});

describe("buildKindBreakdown", () => {
  it("counts current tenants, sums billing and arrears, and separates rent paid direct", () => {
    const base = { current: true, rentTracked: true, monthlyRent: 5000, monthDue: 5000, monthAllocated: 5000, totalOutstanding: 0, overdueMonths: 0 };
    const result = buildKindBreakdown([
      { ...base, kind: "business" },
      { ...base, kind: "business", monthAllocated: 0, totalOutstanding: 10000, overdueMonths: 2 },
      { ...base, kind: "business", current: false, monthDue: 0, monthAllocated: 0, totalOutstanding: 4000, overdueMonths: 1 },
      { ...base, kind: "government", rentTracked: false, monthlyRent: 20000, monthDue: 0, monthAllocated: 0 },
    ]);
    expect(result.map((k) => k.kind)).toEqual(["individual", "business", "government"]);
    expect(result[0]).toMatchObject({ tenants: 0, expected: 0, overdueTenants: 0 });
    expect(result[1]).toMatchObject({ tenants: 2, expected: 10000, collected: 5000, outstanding: 14000, overdueTenants: 2 });
    expect(result[2]).toMatchObject({ tenants: 1, expected: 0, paidDirectTenants: 1, paidDirectRent: 20000 });
  });

  it("leaves rent paid direct out when the view hides it, still counting the tenant", () => {
    const govt = { kind: "government" as const, current: true, rentTracked: false, monthlyRent: 20000, monthDue: 0, monthAllocated: 0, totalOutstanding: 0, overdueMonths: 0 };
    expect(buildKindBreakdown([govt], { paidDirect: false })[2]).toMatchObject({
      tenants: 1,
      paidDirectTenants: 0,
      paidDirectRent: 0,
    });
  });
});

describe("rentReviewDue", () => {
  it("is due once the latest rent is 12 or more months old", () => {
    expect(rentReviewDue(["2025-10-01"], "2026-10-01")).toBe(true);
    expect(rentReviewDue(["2025-10-01", "2026-04-01"], "2026-10-01")).toBe(false);
    expect(rentReviewDue(["2025-11-01"], "2026-10-01")).toBe(false);
    expect(rentReviewDue([], "2026-10-01")).toBe(false);
  });
});

describe("buildAttention", () => {
  it("keeps only non-empty lists, in a fixed order, names sorted", () => {
    const items = buildAttention({
      rentReview: [{ tenantId: "2", displayName: "Zed" }, { tenantId: "1", displayName: "Asha" }],
      drafts: [{ tenantId: "3", displayName: "Mohan" }],
      noDocuments: [],
    });
    expect(items.map((i) => i.kind)).toEqual(["drafts", "rentReview"]);
    expect(items[1].tenants.map((t) => t.displayName)).toEqual(["Asha", "Zed"]);
    expect(items[0].title).toBe("Drafts to complete");
  });
});

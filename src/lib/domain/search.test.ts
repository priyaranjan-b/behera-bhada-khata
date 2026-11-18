import { describe, expect, it } from "vitest";
import type { SearchIndex } from "@/lib/contracts";
import { payableTenants, searchSuggestions } from "./search";

const index: SearchIndex = {
  tenants: [
    {
      tenantId: "t-old",
      displayName: "Ravi Old",
      name: "Ravi Old",
      businessName: null,
      status: "inactive",
      unitCodes: ["AC-T1-G01"],
      canRecordPayment: true,
    },
    {
      tenantId: "t-ravi",
      displayName: "Lotus Prints",
      name: "Ravi Kumar",
      businessName: "Lotus Prints",
      status: "active",
      unitCodes: ["AC-T1-103"],
      canRecordPayment: true,
    },
    {
      tenantId: "t-draft",
      displayName: "Gopal",
      name: "Gopal",
      businessName: null,
      status: "draft",
      unitCodes: [],
      canRecordPayment: false,
    },
  ],
  units: [
    { unitCode: "AC-T1-103", label: null, propertyCode: "AC-T1", propertyName: "Tower 1", occupant: { tenantId: "t-ravi", displayName: "Lotus Prints" } },
    { unitCode: "AC-T2-G01", label: "Godown", propertyCode: "AC-T2", propertyName: "Tower 2", occupant: null },
    { unitCode: "RM-TW-G02", label: "Godown", propertyCode: "RM-TW", propertyName: "Warehouse", occupant: { tenantId: "t-draft", displayName: "Gopal" } },
    { unitCode: "AC-T1-105", label: "Cabin Room", propertyCode: "AC-T1", propertyName: "Tower 1", occupant: null },
  ],
};

const keys = (query: string, limit?: number) => searchSuggestions(index, query, limit).map((s) => s.key);

describe("searchSuggestions", () => {
  it("returns nothing for an empty query", () => {
    expect(searchSuggestions(index, "   ")).toEqual([]);
  });

  it("finds a tenant by name and by business, linking to the tenant page", () => {
    const [byName] = searchSuggestions(index, "kumar");
    expect(byName).toMatchObject({ key: "tenant:t-ravi", primary: "Lotus Prints", href: "/tenants/t-ravi" });
    expect(byName.secondary).toBe("Ravi Kumar · AC-T1-103");
    expect(keys("lotus pr")[0]).toBe("tenant:t-ravi");
  });

  it("lists moved-out tenants after current ones", () => {
    expect(keys("ravi")).toEqual(["tenant:t-ravi", "tenant:t-old"]);
    expect(searchSuggestions(index, "ravi old")[0].secondary).toContain("Moved out");
  });

  it("finds houses by label, going to the occupant or the vacant house's tower", () => {
    const godowns = searchSuggestions(index, "GODOWN");
    expect(godowns.map((s) => s.href)).toEqual(["/properties/AC-T2", "/tenants/t-draft"]);
    expect(godowns[0].secondary).toBe("AC-T2-G01 · Vacant");
    expect(godowns[1].secondary).toBe("RM-TW-G02 · Occupied by Gopal");
    expect(keys("room")).toEqual(["unit:AC-T1-105"]);
  });

  it("finds houses by code and house number", () => {
    expect(keys("ac-t1-10")).toEqual(["unit:AC-T1-103", "unit:AC-T1-105"]);
    expect(keys("103")).toEqual(["unit:AC-T1-103"]);
  });

  it("lists tenants before houses so each group is contiguous", () => {
    // "o" matches tenants and houses at mixed ranks; tenants still come first.
    const kinds = searchSuggestions(index, "o").map((s) => s.kind);
    expect(kinds).toContain("unit");
    expect(kinds.indexOf("unit")).toBeGreaterThan(kinds.lastIndexOf("tenant"));
  });

  it("ranks prefix matches first and respects the limit", () => {
    expect(keys("g")[0]).toBe("tenant:t-draft");
    expect(keys("o", 2)).toHaveLength(2);
  });
});

describe("payableTenants", () => {
  const extra: SearchIndex = {
    ...index,
    tenants: [
      ...index.tenants,
      {
        tenantId: "t-asha",
        displayName: "Asha",
        name: "Asha",
        businessName: null,
        status: "active",
        unitCodes: ["AC-T2-G02"],
        canRecordPayment: true,
      },
    ],
  };

  it("lists those who can pay, current ones alphabetically then moved-out ones, when there is no query", () => {
    expect(payableTenants(extra, " ").map((t) => t.tenantId)).toEqual(["t-asha", "t-ravi", "t-old"]);
    expect(payableTenants(extra, "old")[0].secondary).toBe("AC-T1-G01 · Moved out");
  });

  it("matches by name, business, house code or house number", () => {
    expect(payableTenants(extra, "kumar").map((t) => t.tenantId)).toEqual(["t-ravi"]);
    expect(payableTenants(extra, "g02").map((t) => t.tenantId)).toEqual(["t-asha"]);
    expect(payableTenants(extra, "103")[0]).toEqual({
      tenantId: "t-ravi",
      primary: "Lotus Prints",
      secondary: "Ravi Kumar · AC-T1-103",
    });
    expect(payableTenants(extra, "gopal")).toEqual([]);
  });
});

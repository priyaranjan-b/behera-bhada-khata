import { describe, expect, it } from "vitest";
import { crumbsForPath, pageTitleFor } from "./AppBreadcrumbs";

describe("crumbsForPath", () => {
  it("starts every trail at the Overview and links all but the last crumb", () => {
    expect(crumbsForPath("/")).toEqual([{ label: "Overview" }]);
    expect(crumbsForPath("/tenants/t-1/edit")).toEqual([
      { label: "Overview", href: "/" },
      { label: "Tenants", href: "/tenants" },
      { label: "Tenant", href: "/tenants/t-1" },
      { label: "Edit tenant" },
    ]);
  });

  it("skips prefixes with no page, and prefers a static segment over :id", () => {
    expect(crumbsForPath("/payments/p-1/adjust").map((c) => c.label)).toEqual(["Overview", "Payments", "Adjust payment"]);
    expect(crumbsForPath("/payments/new").map((c) => c.label)).toEqual(["Overview", "Payments", "Record payment"]);
    expect(crumbsForPath("/properties/new").map((c) => c.label)).toEqual(["Overview", "Properties", "New property"]);
  });
});

describe("pageTitleFor", () => {
  it("names the page a navigation goes to, as its last crumb", () => {
    expect(pageTitleFor("/")).toBe("Overview");
    expect(pageTitleFor("/tenants")).toBe("Tenants");
    expect(pageTitleFor("/tenants/00000000-0000-4000-8000-000000000001")).toBe("Tenant");
    expect(pageTitleFor("/payments/new")).toBe("Record payment");
    expect(pageTitleFor("/no-such-page")).toBeNull();
  });
});

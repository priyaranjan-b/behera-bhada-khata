import { describe, expect, it } from "vitest";
import { crumbsForPath } from "./AppBreadcrumbs";

describe("crumbsForPath", () => {
  it("starts every trail at the Overview and links all but the last crumb", () => {
    expect(crumbsForPath("/")).toEqual([{ label: "Overview" }]);
    expect(crumbsForPath("/tenants/t-1/edit")).toEqual([
      { label: "Overview", href: "/" },
      { label: "Tenants", href: "/tenants" },
      { label: "Tenant", href: "/tenants/t-1" },
      { label: "Edit" },
    ]);
  });

  it("skips prefixes with no page, and prefers a static segment over :id", () => {
    expect(crumbsForPath("/payments/p-1/adjust").map((c) => c.label)).toEqual(["Overview", "Adjust payment"]);
    expect(crumbsForPath("/properties/new").map((c) => c.label)).toEqual(["Overview", "Properties", "New property"]);
  });
});

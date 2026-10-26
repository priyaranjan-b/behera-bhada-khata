import { describe, expect, it } from "vitest";
import { activeFilters } from "./gridQuery";

describe("activeFilters", () => {
  it("keeps filters with a value and the empty / not-empty checks, drops the rest", () => {
    expect(
      activeFilters([
        { field: "title", operator: "contains", value: "rent" },
        { field: "title", operator: "contains", value: "  " },
        { field: "title", operator: "equals" },
        { field: "unitCode", operator: "isEmpty" },
        { field: "unitCode", operator: "isNotEmpty", value: "" },
      ])
    ).toEqual([
      { field: "title", operator: "contains", value: "rent" },
      { field: "unitCode", operator: "isEmpty" },
      { field: "unitCode", operator: "isNotEmpty", value: "" },
    ]);
  });
});

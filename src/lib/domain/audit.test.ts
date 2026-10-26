import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/types";
import { AUDIT_CATEGORIES, actionsInCategory, auditActionLabel, auditCategoryOf } from "./audit";

// The text of each row is written by the database (0017); test/schema.test.ts
// covers it and checks the SQL labels match these.
describe("audit labels", () => {
  it("labels every action and puts each in exactly one category", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(auditActionLabel(action)).not.toMatch(/[._]/);
    }
    const categorised = AUDIT_CATEGORIES.flatMap(actionsInCategory);
    expect(categorised.sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(auditCategoryOf("rent_rate.changed")).toBe("rent");
  });
});

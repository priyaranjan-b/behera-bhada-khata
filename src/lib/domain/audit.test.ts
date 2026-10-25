import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/types";
import {
  AUDIT_CATEGORIES,
  actionsInCategory,
  auditActionLabel,
  auditCategoryOf,
  describeAuditEntry,
} from "./audit";

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

describe("describeAuditEntry", () => {
  it("shows an edit as before → after, with formatted money and labels", () => {
    expect(
      describeAuditEntry({
        action: "rent_rate.changed",
        changes: { monthly_amount: [6000, 6500] },
        context: {},
      })
    ).toEqual({ title: "Rent changed", lines: ["Monthly rent: ₹6,000.00 → ₹6,500.00"] });
  });

  it("lists a new row's values, formatting dates, months and enums", () => {
    const { lines } = describeAuditEntry({
      action: "payment.recorded",
      changes: {
        amount: [null, 5000],
        payment_date: [null, "2026-03-05"],
        mode: [null, "bank_transfer"],
        receipt_no: [null, "2026/03/001"],
        original_payment_id: [null, "x"],
      },
      context: {},
    });
    expect(lines).toEqual(["Receipt: 2026/03/001", "Amount: ₹5,000.00", "Paid on: 5 Mar 2026", "Mode: Bank transfer"]);
  });

  it("never shows a raw value", () => {
    const { lines } = describeAuditEntry({
      action: "tenant.moved_out",
      changes: {
        status: ["active", "inactive"],
        moved_out_on: [null, "2026-02-28"],
        preferred_channel: ["both", "sms"],
        billing_start: ["2026-01-01", "2026-02-01"],
      },
      context: {},
    });
    expect(lines.join("\n")).not.toMatch(/inactive|_|\d{4}-\d{2}-\d{2}/);
    expect(lines).toContain("Status: Active → Moved out");
  });

  it("says a signature was replaced without showing where it's stored", () => {
    expect(
      describeAuditEntry({
        action: "profile.updated",
        changes: { signature_path: ["owner/a.png", "owner/b.png"] },
        context: {},
      }).lines
    ).toEqual(["Saved signature replaced"]);
  });

  it("describes app events from their context", () => {
    expect(
      describeAuditEntry({ action: "message.sent", changes: {}, context: { channel: "sms", delivered: false, receiptNo: "2026/03/001" } })
    ).toEqual({ title: "Link not delivered to tenant", lines: ["SMS · not delivered", "Receipt 2026/03/001"] });
    expect(describeAuditEntry({ action: "auth.sign_in", changes: {}, context: { method: "password" } }).lines).toEqual([
      "Password",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { PAYMENT_MODES } from "@/lib/types";
import { PAYMENT_MODE_OPTIONS, isPaymentMode, paymentModeLabel } from "./payments";

describe("payment modes", () => {
  it("labels every mode, never showing the raw value", () => {
    expect(paymentModeLabel("bank_transfer")).toBe("Bank transfer");
    expect(paymentModeLabel("upi")).toBe("UPI");
    expect(paymentModeLabel("something_new")).toBe("Other");
  });

  it("offers every mode once, in order", () => {
    expect(PAYMENT_MODE_OPTIONS.map((o) => o.value)).toEqual([...PAYMENT_MODES]);
  });

  it("recognises modes", () => {
    expect(isPaymentMode("cash")).toBe(true);
    expect(isPaymentMode("Cash")).toBe(false);
  });
});

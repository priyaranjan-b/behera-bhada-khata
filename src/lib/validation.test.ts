import { describe, expect, it } from "vitest";
import {
  MAX_SIGNATURE_DATA_URL_LENGTH,
  PASSWORD_LIMITS,
  changePasswordSchema,
  createPaymentSchema,
  magicLinkSchema,
  passwordSignInSchema,
} from "./validation";

const valid = {
  tenantId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f",
  amount: "5000.50",
  paymentDate: "2026-03-05",
  mode: "upi",
  allocations: [{ rentPeriodId: "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000.5 }],
  ownerSignaturePng: "data:image/png;base64,AAAA",
};

describe("createPaymentSchema", () => {
  it("accepts a well-formed payment and coerces amounts", () => {
    expect(createPaymentSchema.parse(valid).amount).toBe(5000.5);
  });

  it.each([
    ["an impossible date", { paymentDate: "2026-02-30" }],
    ["fractions of a paisa", { amount: 10.001 }],
    ["a zero amount", { amount: 0 }],
    ["an oversized signature", { ownerSignaturePng: `data:image/png;base64,${"A".repeat(MAX_SIGNATURE_DATA_URL_LENGTH)}` }],
    ["a non-PNG signature", { ownerSignaturePng: "data:image/svg+xml;base64,AAAA" }],
  ])("rejects %s", (_label, patch) => {
    expect(createPaymentSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("magicLinkSchema", () => {
  it("normalises and validates the email", () => {
    expect(magicLinkSchema.parse({ email: "  Owner@Example.COM " }).email).toBe("owner@example.com");
    expect(magicLinkSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("passwordSignInSchema", () => {
  it("normalises the email and needs a password", () => {
    expect(passwordSignInSchema.parse({ email: " Owner@Example.COM ", password: "x" }).email).toBe("owner@example.com");
    expect(passwordSignInSchema.safeParse({ email: "owner@example.com", password: "" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const ok = "a".repeat(PASSWORD_LIMITS.minLength);
  it("needs the minimum length and a matching confirmation", () => {
    expect(changePasswordSchema.safeParse({ password: ok, confirmPassword: ok }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ password: ok.slice(1), confirmPassword: ok.slice(1) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password: ok, confirmPassword: `${ok}b` }).success).toBe(false);
    const long = "a".repeat(PASSWORD_LIMITS.maxLength + 1);
    expect(changePasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
  });
});

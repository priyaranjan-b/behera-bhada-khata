import { describe, expect, it, vi } from "vitest";
import { env, missingTwilioKeys, otpEnabled, resetEnvCacheForTests } from "./env";

/** What sending links needs; the Verify service SID is only for codes (A34). */
const TWILIO = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM"];

function production(overrides: Record<string, string>) {
  vi.stubEnv("NODE_ENV", "production");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
  resetEnvCacheForTests();
}

describe("env in production", () => {
  it("starts without Twilio and reports what is missing", () => {
    production(Object.fromEntries([...TWILIO, "TWILIO_VERIFY_SERVICE_SID"].map((k) => [k, ""])));
    expect(() => env()).not.toThrow();
    expect(missingTwilioKeys()).toEqual(TWILIO);
    expect(otpEnabled()).toBe(false);
  });

  it("sends codes through the provider OTP_PROVIDER names, once its keys are set (A34)", () => {
    production({ OTP_PROVIDER: "twofactor", TWOFACTOR_API_KEY: "" });
    expect(otpEnabled()).toBe(false);
    production({ OTP_PROVIDER: "twofactor", TWOFACTOR_API_KEY: "key" });
    expect(otpEnabled()).toBe(true);
    production({ OTP_PROVIDER: "twilio" });
    expect(otpEnabled()).toBe(true);
    production({ OTP_PROVIDER: "sms-gateway" });
    expect(() => env()).toThrow();
  });

  it("still needs CRON_SECRET", () => {
    production({ CRON_SECRET: "" });
    expect(() => env()).toThrow(/CRON_SECRET: Required in production/);
  });
});

describe("server-only secrets", () => {
  it("refuses a NEXT_PUBLIC_ copy of DATABASE_URL, which Next would put in the browser bundle", () => {
    production({ NEXT_PUBLIC_DATABASE_URL: "postgresql://app_drizzle.ref:pw@pooler.supabase.com:6543/postgres" });
    expect(() => env()).toThrow(/NEXT_PUBLIC_DATABASE_URL: Would be sent to the browser; set DATABASE_URL instead/);
  });

  it("accepts DATABASE_URL itself", () => {
    production({ DATABASE_URL: "postgresql://app_drizzle.ref:pw@pooler.supabase.com:6543/postgres" });
    expect(env().DATABASE_URL).toMatch(/^postgresql:/);
  });

  it("needs DATABASE_URL, as a postgres:// string", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    production({});
    expect(() => env()).toThrow(/DATABASE_URL: Required/);
    production({ DATABASE_URL: "https://project.supabase.co" });
    expect(() => env()).toThrow(/DATABASE_URL: Must be a postgres:\/\/ connection string/);
  });
});

import { describe, expect, it, vi } from "vitest";
import { env, missingTwilioKeys, resetEnvCacheForTests } from "./env";

const TWILIO = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM"];

function production(overrides: Record<string, string>) {
  vi.stubEnv("NODE_ENV", "production");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
  resetEnvCacheForTests();
}

describe("env in production", () => {
  it("starts without Twilio and reports what is missing", () => {
    production(Object.fromEntries(TWILIO.map((k) => [k, ""])));
    expect(() => env()).not.toThrow();
    expect(missingTwilioKeys()).toEqual(TWILIO);
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
    production({
      DATA_ADAPTER: "drizzle",
      DATABASE_URL: "postgresql://app_drizzle.ref:pw@pooler.supabase.com:6543/postgres",
    });
    expect(env().DATABASE_URL).toMatch(/^postgresql:/);
  });

  it("needs DATABASE_URL when the Drizzle adapter is on", () => {
    production({ DATA_ADAPTER: "drizzle", DATABASE_URL: "" });
    expect(() => env()).toThrow(/DATABASE_URL: Required when DATA_ADAPTER=drizzle/);
  });
});

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

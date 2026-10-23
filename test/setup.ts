// A complete, valid environment for every test (see src/server/env.ts);
// individual tests override variables with vi.stubEnv.
import { afterEach, beforeEach, vi } from "vitest";
import { resetEnvCacheForTests } from "@/server/env";

const TEST_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  SUPABASE_SECRET_KEY: "secret",
  NEXT_PUBLIC_APP_URL: "https://rent.test",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "twilio-token",
  TWILIO_VERIFY_SERVICE_SID: "VA00000000000000000000000000000000",
  TWILIO_SMS_FROM: "+15005550006",
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
  CRON_SECRET: "cron-secret-at-least-16",
};

beforeEach(() => {
  for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
  resetEnvCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

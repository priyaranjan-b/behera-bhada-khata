// The only place server code reads process.env (ESLint enforces it). Parsed
// once on first use and checked at server start by src/instrumentation.ts,
// so a missing or malformed variable fails loudly instead of surfacing as
// `undefined` deep inside a request. No "server-only" import: the proxy
// bundle (src/proxy.ts) reads it too.
import * as z from "zod";

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const PRODUCTION_REQUIRED = ["CRON_SECRET"] as const;

const TWILIO_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_SMS_FROM",
  "TWILIO_WHATSAPP_FROM",
] as const;

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.url(),

  // Optional everywhere: without them tenant messages fail as "not delivered"
  // and the tenant can't get an OTP, but payments still count (D20).
  TWILIO_ACCOUNT_SID: optional(z.string()),
  TWILIO_AUTH_TOKEN: optional(z.string()),
  TWILIO_VERIFY_SERVICE_SID: optional(z.string()),
  TWILIO_SMS_FROM: optional(z.string()),
  TWILIO_WHATSAPP_FROM: optional(z.string()),

  // Optional in development (the cron endpoint then stays locked); required in production - see below.
  CRON_SECRET: optional(z.string().min(16, "CRON_SECRET must be at least 16 characters")),

  /** Comma-separated owner emails allowed to sign in and create an account. */
  OWNER_EMAILS: optional(z.string()),
  /** "1" = hand the magic link back in the response instead of emailing it. Never honoured in production. */
  ALLOW_DEV_LOGIN: optional(z.string()),

  API_BASE_URL: optional(z.url()),

  // Data adapter (A19): "supabase" (default) or "drizzle", which binds the
  // namespaces moved to src/server/adapters/drizzle. The one-switch rollback.
  DATA_ADAPTER: z.enum(["supabase", "drizzle"]).default("supabase"),
  /** Postgres connection string for the Drizzle adapter: Supabase's transaction pooler (port 6543). */
  DATABASE_URL: optional(z.string().regex(/^postgres(ql)?:\/\//, "Must be a postgres:// connection string")),
}).superRefine((e, ctx) => {
  if (e.DATA_ADAPTER === "drizzle" && !e.DATABASE_URL) {
    ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Required when DATA_ADAPTER=drizzle" });
  }
  if (e.NODE_ENV !== "production") return;
  for (const key of PRODUCTION_REQUIRED) {
    if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required in production" });
  }
});

export type Env = z.infer<typeof schema>;

/**
 * Secrets that must never reach the browser. Next.js inlines every
 * NEXT_PUBLIC_* variable into the client bundle, so a NEXT_PUBLIC_ copy of
 * one of these is refused at startup instead of being shipped.
 */
const SERVER_ONLY_SECRETS = ["DATABASE_URL", "SUPABASE_SECRET_KEY", "CRON_SECRET", "TWILIO_AUTH_TOKEN"] as const;

/** NEXT_PUBLIC_ copies of the server-only secrets that are set. */
function leakedSecrets(): string[] {
  return SERVER_ONLY_SECRETS.map((key) => `NEXT_PUBLIC_${key}`).filter((key) => process.env[key]?.trim());
}

let cached: Env | undefined;

/** The validated environment. Throws listing every problem if it's invalid. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  const problems = [
    ...(parsed.success ? [] : parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`)),
    ...leakedSecrets().map(
      (key) => `  - ${key}: Would be sent to the browser; set ${key.slice("NEXT_PUBLIC_".length)} instead (server only)`
    ),
  ];
  if (!parsed.success || problems.length) {
    throw new Error(`Invalid environment variables (see .env.local.example):\n${problems.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * API_BASE_URL alone, without validating the rest. Server Components check it
 * before anything marks the request dynamic, so it must not throw during
 * `next build` prerendering.
 */
export function apiBaseUrl(): string | undefined {
  const value = process.env.API_BASE_URL?.trim();
  return value ? z.url().parse(value) : undefined;
}

/** Dev-only sign-in shortcut: needs the explicit flag, and never in a production build. */
export function devLoginEnabled(): boolean {
  const e = env();
  return e.NODE_ENV !== "production" && e.ALLOW_DEV_LOGIN === "1";
}

/** Normalised OWNER_EMAILS, or null when unset. */
export function ownerEmailAllowlist(): Set<string> | null {
  const raw = env().OWNER_EMAILS;
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** The Twilio variables that are unset; empty when tenant messaging is configured. */
export function missingTwilioKeys(): string[] {
  const e = env();
  return TWILIO_KEYS.filter((k) => !e[k]);
}

/** Twilio is fully configured, so tenants can be sent links and OTP codes. */
export function tenantMessagingEnabled(): boolean {
  return missingTwilioKeys().length === 0;
}

/** Called from src/instrumentation.ts. Skipped while `next build` runs, which needs no secrets. */
export function validateEnvAtStartup(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const e = env();
  const missing = missingTwilioKeys();
  if (e.NODE_ENV === "production" && missing.length) {
    console.warn(`Twilio isn't configured (${missing.join(", ")}): tenants won't get links or OTP codes.`);
  }
}

/** Tests only: forget the parsed environment so changed variables are re-read. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}

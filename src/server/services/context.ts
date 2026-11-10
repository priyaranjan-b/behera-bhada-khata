import "server-only";
import * as z from "zod";
import { ApiError } from "@/lib/errors";
import type { Tenant } from "@/lib/types";
import { systemDb } from "@/server/infra";

/**
 * Proof that the call is made by the app owner (built by getOwnerContext in
 * ./auth). There is a single owner, so it scopes nothing - services take it
 * so they can't be called without that check. `ownerId` is the signed-in
 * user id, for logs.
 */
export interface OwnerContext {
  ownerId: string;
  email?: string;
}

/**
 * Proof that the call is made by a signed-in tenant (built by
 * getTenantContext in ./tenantAuth from the session cookie, A32). Services
 * read data only for `tenantId`, never for an id the request names.
 */
export interface TenantContext {
  sessionId: string;
  tenantId: string;
}

/** Transport facts a public service needs for abuse control; filled in by src/server/http.ts. */
export interface RequestMeta {
  /** Best-effort client IP, or "unknown". */
  ip: string;
}

/** A file from a multipart request, as read by src/server/http.ts. Untrusted: check the bytes. */
export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** Validates untrusted input; the first issue becomes a 400. */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  return parsed.data;
}

/** Spreads an untrusted JSON body (which may not be an object) under path params. */
export function withParams(body: unknown, params: Record<string, string>): Record<string, unknown> {
  return { ...(typeof body === "object" && body !== null ? body : {}), ...params };
}

export function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`);
}

/**
 * A code from the URL (tower, house) parsed with `schema`; anything
 * malformed, a broken %-escape included, is simply `what` not found.
 */
export function requireCode(raw: string, schema: z.ZodType<string>, what: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    notFound(what);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) notFound(what);
  return parsed.data;
}

export interface RateLimit {
  /** Counter name, e.g. `otp:token:<hash>` - every distinct key is counted separately. */
  key: string;
  limit: number;
  windowSeconds: number;
  /** What the 429 says when this limit is the one exceeded; the generic text otherwise. */
  message?: string;
}

const TOO_MANY = "Too many attempts. Please wait a while and try again.";

/** Counts one hit against each limit; 429 if any of them is exceeded, with that limit's message if it has one. */
export async function enforceRateLimits(limits: RateLimit[]): Promise<void> {
  const db = systemDb();
  const allowed = await Promise.all(limits.map((l) => db.rateLimits.hit(l.key, l.limit, l.windowSeconds)));
  const refused = limits.filter((_, i) => !allowed[i]);
  if (refused.length > 0) throw new ApiError(429, refused.find((l) => l.message)?.message ?? TOO_MANY);
}

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Every rate limit in one table. A route that costs money or sends email
 * counts one hit per record/email and one per IP:
 * `{ key: \`otp:ip:${ip}\`, ...RATE_LIMITS.otpPerIp }`.
 */
export const RATE_LIMITS = {
  // Every owner API call (A17): far above what the screens send, so only a
  // runaway script or a stolen session hits it.
  ownerApiPerMinute: { limit: 300, windowSeconds: MINUTE },
  magicLinkPerEmail: { limit: 5, windowSeconds: HOUR },
  magicLinkPerIp: { limit: 20, windowSeconds: HOUR },
  passwordPerEmail: { limit: 10, windowSeconds: HOUR },
  passwordPerIp: { limit: 30, windowSeconds: HOUR },
  otpPerRecord: { limit: 5, windowSeconds: HOUR },
  otpPerIp: { limit: 20, windowSeconds: HOUR },
  // Codes one phone number may be sent in a day, sign-in (A32) and
  // acknowledging a payment together (phoneDailyCodeLimit in ./otp). The day
  // is the rate-limit window, cut in UTC: it resets at 05:30 IST.
  otpPerPhonePerDay: { limit: 4, windowSeconds: DAY },
  confirmPerRecord: { limit: 10, windowSeconds: HOUR },
  confirmPerIp: { limit: 30, windowSeconds: HOUR },
  // Guesses at the current password when changing it (S4): a stolen session can't brute-force it.
  passwordChangePerOwner: { limit: 5, windowSeconds: HOUR },
  // Tenant portal sign-in (A32). Every code is a paid SMS: a burst limit per
  // number (the daily one is otpPerPhonePerDay), per client, and a daily cap
  // on all of them against SMS pumping.
  tenantOtpPerPhoneShort: { limit: 3, windowSeconds: 15 * MINUTE },
  tenantOtpPerIp: { limit: 20, windowSeconds: HOUR },
  // Counted only for codes actually sent to a tenant, so junk requests can't use it up for everyone.
  tenantOtpPerDay: { limit: 200, windowSeconds: DAY },
  tenantVerifyPerPhone: { limit: 5, windowSeconds: HOUR },
  // About 10 guesses a day at one number, and the real tenant locked out at most until tomorrow.
  tenantVerifyPerPhoneDay: { limit: 10, windowSeconds: DAY },
  tenantVerifyPerIp: { limit: 30, windowSeconds: HOUR },
  // Every tenant API call, and the downloads (receipts render a PDF) on their own.
  tenantApiPerMinute: { limit: 120, windowSeconds: MINUTE },
  tenantDownloadsPerHour: { limit: 30, windowSeconds: HOUR },
} as const;

/**
 * What may be logged of an error from an outside service: its kind and code,
 * never the message, which can quote a phone number (Twilio's "Invalid
 * parameter `To`: +91...").
 */
export function loggableError(err: unknown): { name?: string; code?: unknown; status?: unknown } {
  if (typeof err !== "object" || err === null) return { name: typeof err };
  const e = err as { name?: unknown; code?: unknown; status?: unknown };
  return { name: typeof e.name === "string" ? e.name : undefined, code: e.code, status: e.status };
}

/** Counts one tenant API call against the session's per-minute budget; 429 when it runs out (A32). */
export async function enforceTenantRateLimit(ctx: TenantContext): Promise<void> {
  await enforceRateLimits([{ key: `tenant:${ctx.sessionId}`, ...RATE_LIMITS.tenantApiPerMinute }]);
}

/** Counts one owner API call against the owner's per-minute budget; 429 when it runs out (A17). */
export async function enforceOwnerRateLimit(ctx: OwnerContext): Promise<void> {
  await enforceRateLimits([{ key: `owner:${ctx.ownerId}`, ...RATE_LIMITS.ownerApiPerMinute }]);
}

/** Lifetime of a signed storage URL handed to the browser (documents, proofs, signatures, receipts). */
export const SIGNED_URL_SECONDS = 5 * 60;
/** The tenant-signed receipt link shown right after acknowledging: long enough to read and save it. */
export const ACKNOWLEDGED_RECEIPT_URL_SECONDS = HOUR;
/**
 * How long a tenant's /confirm link keeps working after they acknowledge, to
 * fetch their signed receipt again. After that a forwarded or old link shows
 * nothing; the owner can still download and share the receipt.
 */
export const ACKNOWLEDGED_LINK_SECONDS = 14 * DAY;

/**
 * An id from the URL that isn't a uuid can't exist: 404 here rather than a
 * 500 when Postgres rejects it. Every service taking a path id calls this
 * (or requireTenant) before touching the database.
 */
export function requireId(id: string, what: string): string {
  if (!z.uuid().safeParse(id).success) notFound(what);
  return id;
}

/** The tenant, or 404 - for a malformed id too. */
export async function requireTenant(
  db: { tenants: { get(id: string): Promise<Tenant | null> } },
  tenantId: string
): Promise<Tenant> {
  requireId(tenantId, "Tenant");
  const tenant = await db.tenants.get(tenantId);
  if (!tenant) notFound("Tenant");
  return tenant;
}

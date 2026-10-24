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

export interface RateLimit {
  /** Counter name, e.g. `otp:token:<hash>` - every distinct key is counted separately. */
  key: string;
  limit: number;
  windowSeconds: number;
}

/** Counts one hit against each limit; 429 if any of them is exceeded. */
export async function enforceRateLimits(limits: RateLimit[]): Promise<void> {
  const db = systemDb();
  const allowed = await Promise.all(limits.map((l) => db.rateLimits.hit(l.key, l.limit, l.windowSeconds)));
  if (allowed.includes(false)) throw new ApiError(429, "Too many attempts. Please wait a while and try again.");
}

export const HOUR = 60 * 60;

/**
 * Every rate limit in one table, per hour. A route that costs money or sends
 * email counts one hit per record/email and one per IP:
 * `{ key: \`otp:ip:${ip}\`, ...RATE_LIMITS.otpPerIp }`.
 */
export const RATE_LIMITS = {
  magicLinkPerEmail: { limit: 5, windowSeconds: HOUR },
  magicLinkPerIp: { limit: 20, windowSeconds: HOUR },
  passwordPerEmail: { limit: 10, windowSeconds: HOUR },
  passwordPerIp: { limit: 30, windowSeconds: HOUR },
  otpPerRecord: { limit: 5, windowSeconds: HOUR },
  otpPerIp: { limit: 20, windowSeconds: HOUR },
  confirmPerRecord: { limit: 10, windowSeconds: HOUR },
  confirmPerIp: { limit: 30, windowSeconds: HOUR },
} as const;

/** Lifetime of a signed storage URL handed to the browser (documents, proofs, signatures, receipts). */
export const SIGNED_URL_SECONDS = 5 * 60;
/** The tenant-signed receipt link shown right after acknowledging: long enough to read and save it. */
export const ACKNOWLEDGED_RECEIPT_URL_SECONDS = HOUR;

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

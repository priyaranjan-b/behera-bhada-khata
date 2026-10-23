import "server-only";
import type * as z from "zod";
import { ApiError } from "@/lib/errors";
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

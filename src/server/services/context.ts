import "server-only";
import type * as z from "zod";
import { ApiError } from "@/lib/errors";

/** Who a service call is acting for. Built from the session by the caller (route handler or server API). */
export interface OwnerContext {
  ownerId: string;
  email?: string;
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

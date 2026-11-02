import "server-only";
import type { SystemRepositories } from "@/server/ports";
import { inScope, type Db, type Tx } from "../client";
import { must } from "../errors";
import { checkRateLimit, hitRateLimit, pruneRateLimits } from "../tables/rateLimits";
import type { RepositoryOverrides } from "./owner";

/**
 * A rate-limit key's kind for a log label, never the IP, id or hash after it:
 * "otp:ip:2001:db8::1" -> "otp:ip", "owner:<uuid>" -> "owner". Matched from
 * the start, so an IPv6 address's colons can't leak into it.
 */
export function limitKind(key: string): string {
  return /^[a-z-]+(?::(?:ip|email|record))?(?=:)/.exec(key)?.[0] ?? "?";
}

/** The SQLSTATE under Drizzle's wrapper, if any. */
function sqlStateOf(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined; e && typeof e === "object"; e = e.cause as typeof e) {
    if (typeof e.code === "string") return e.code;
  }
  return undefined;
}

/**
 * The unscoped repositories that have moved to Drizzle (A19), run as
 * service_role through inScope. Only for flows that authorize another way
 * (confirm token, rent-period upkeep, rate limits, cron). service_role needs
 * 0028 (app_drizzle may switch to it).
 */
export function drizzleSystemRepositories(db: Db): RepositoryOverrides<SystemRepositories> {
  /** One statement as service_role; a failure is a 500 naming `what`. */
  const asSystem = <T>(what: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
    must(
      inScope(db, { role: "service_role" }, fn).catch((err: unknown) => {
        // The login can't act as service_role: 0028 hasn't run (or 0027 was re-run after it).
        // Say so loudly, once per failure, instead of a bare "permission denied".
        if (sqlStateOf(err) === "42501") {
          console.error(`${what}: app_drizzle may not switch to service_role - run migration 0028 (D32)`);
        }
        throw err;
      }),
      what
    );

  return {
    rateLimits: {
      // async, so a bad limit is a rejected promise like any other failure.
      hit: async (key, limit, windowSeconds) => {
        checkRateLimit(limit, windowSeconds);
        return asSystem(`rate limit ${limitKind(key)}`, (tx) => hitRateLimit(tx, key, limit, windowSeconds));
      },
      prune: () => asSystem("prune rate limits", pruneRateLimits),
    },
  };
}

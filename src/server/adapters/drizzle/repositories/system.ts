import "server-only";
import type { SystemRepositories } from "@/server/ports";
import { inScope, type Db, type Tx } from "../client";
import { must, mustWrite } from "../errors";
import { acknowledge, ensureRentPeriods, logEvent } from "../procedures/system";
import {
  findAdjustmentByTokenHash,
  findPaymentByTokenHash,
  getAdjustment,
  getPayment,
  listAdjustmentAllocations,
  listPaymentAllocations,
  listPaymentProofs,
  listRentPeriodsByIds,
} from "../tables/ledger";
import { getLocation, getProperty, listOccupancy } from "../tables/places";
import { checkRateLimit, hitRateLimit, pruneRateLimits } from "../tables/rateLimits";
import { getOtpSession, pruneOtpSessions, removeOtpSession, saveOtpSession } from "../tables/otpSessions";
import { getTenant, listTenantsByPhone } from "../tables/tenants";
import {
  chooseTenantSessionTenancy,
  createTenantSession,
  findActiveTenantSession,
  pruneTenantSessions,
  revokeTenantSession,
} from "../tables/tenantSessions";

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
 * The unscoped repositories on Drizzle (A19): every method, run as
 * service_role through inScope. Only for flows that authorize another way
 * (confirm token, rent-period upkeep, rate limits, cron). service_role needs
 * 0028 (app_drizzle may switch to it).
 */
export function drizzleSystemRepositories(db: Db): SystemRepositories {
  /**
   * Runs `fn` as service_role, `wrap` (must or mustWrite) mapping a failure.
   * A permission failure is never the caller's mistake here: the login can't
   * act as service_role (0028 hasn't run, or 0027 was re-run after it) or a
   * grant is missing. It is logged with the fix and is a 500, never the
   * owner-facing "Not allowed".
   */
  const asServiceRole = <T>(what: string, fn: (tx: Tx) => Promise<T>, wrap: typeof must): Promise<T> =>
    inScope(db, { role: "service_role" }, fn).catch((err: unknown) => {
      if (sqlStateOf(err) === "42501") {
        console.error(`${what}: permission denied as service_role - run migration 0028 (D32), or a grant is missing`);
        throw new Error(`${what}: [42501] permission denied as service_role`);
      }
      return wrap(Promise.reject(err), what);
    });
  /** A read as service_role; a failure is a 500 naming `what`. */
  const asSystem = <T>(what: string, fn: (tx: Tx) => Promise<T>): Promise<T> => asServiceRole(what, fn, must);
  /** A write as service_role: a function's BBK error or a constraint is the caller's (writeError), anything else a 500. */
  const writeAsSystem = <T>(what: string, fn: (tx: Tx) => Promise<T>): Promise<T> => asServiceRole(what, fn, mustWrite);

  return {
    audit: {
      // For someone without an owner session (the tenant, a failed sign-in) or the system; recordEvent decides if a failure matters.
      log: (event) =>
        writeAsSystem(`log event ${event.action}${event.tenantId ? ` for tenant ${event.tenantId}` : ""}`, (tx) =>
          logEvent(tx, event, { kind: event.actorKind, id: event.actorId })
        ),
    },
    locations: {
      get: (code) => asSystem(`get location ${code}`, (tx) => getLocation(tx, code)),
    },
    properties: {
      get: (code) => asSystem(`get property ${code}`, (tx) => getProperty(tx, code)),
    },
    tenants: {
      get: (id) => asSystem(`get tenant ${id}`, (tx) => getTenant(tx, id)),
      // Never log the phone.
      listByPhone: (phone) => asSystem("list tenants by phone", (tx) => listTenantsByPhone(tx, phone)),
    },
    // The tenant portal's sessions (A32): never log the token hash or phone.
    tenantSessions: {
      create: (row) => writeAsSystem("create tenant session", (tx) => createTenantSession(tx, row)),
      findActive: (hash) => asSystem("find tenant session", (tx) => findActiveTenantSession(tx, hash)),
      choose: (id, tenantId) =>
        writeAsSystem(`choose tenancy ${tenantId} for tenant session ${id}`, (tx) => chooseTenantSessionTenancy(tx, id, tenantId)),
      revoke: (id) => writeAsSystem(`revoke tenant session ${id}`, (tx) => revokeTenantSession(tx, id)),
      prune: () => asSystem("prune tenant sessions", pruneTenantSessions),
    },
    occupancy: {
      listForTenant: (tenantId) =>
        asSystem(`list occupancy of tenant ${tenantId}`, (tx) => listOccupancy(tx, { tenantIds: [tenantId] })),
    },
    rentPeriods: {
      listByIds: (ids) => asSystem(`list ${ids.length} rent periods`, (tx) => listRentPeriodsByIds(tx, ids)),
      ensure: async (tenantIds, throughMonth) => {
        if (tenantIds && tenantIds.length === 0) return 0;
        // asSystem, not writeAsSystem: upkeep has no user input, so any failure is a 500 (as on Supabase).
        return asSystem(`ensure rent periods${tenantIds ? ` of ${tenantIds.length} tenants` : ""} through ${throughMonth}`, (tx) =>
          ensureRentPeriods(tx, tenantIds, throughMonth)
        );
      },
    },
    // The confirm link (possession of the token is the authorization): never log the hash.
    payments: {
      findByTokenHash: (hash) => asSystem("find payment by link", (tx) => findPaymentByTokenHash(tx, hash)),
      get: (id) => asSystem(`get payment ${id}`, (tx) => getPayment(tx, id)),
      listAllocations: (id) => asSystem(`list allocations of payment ${id}`, (tx) => listPaymentAllocations(tx, id)),
      listProofs: (ids) => asSystem(`list proofs of ${ids.length} payments`, (tx) => listPaymentProofs(tx, ids)),
      acknowledge: (id, patch) => writeAsSystem(`acknowledge payment ${id}`, (tx) => acknowledge(tx, "payment", id, patch)),
    },
    adjustments: {
      findByTokenHash: (hash) => asSystem("find adjustment by link", (tx) => findAdjustmentByTokenHash(tx, hash)),
      get: (id) => asSystem(`get adjustment ${id}`, (tx) => getAdjustment(tx, id)),
      listAllocations: (id) => asSystem(`list allocations of adjustment ${id}`, (tx) => listAdjustmentAllocations(tx, id)),
      acknowledge: (id, patch) =>
        writeAsSystem(`acknowledge adjustment ${id}`, (tx) => acknowledge(tx, "adjustment", id, patch)),
    },
    // Keys are keyed hashes of a phone: still never logged.
    otpSessions: {
      save: (key, reference, expiresAt) => asSystem("save code reference", (tx) => saveOtpSession(tx, key, reference, expiresAt)),
      get: (key) => asSystem("get code reference", (tx) => getOtpSession(tx, key)),
      remove: (key) => asSystem("remove code reference", (tx) => removeOtpSession(tx, key)),
      prune: () => asSystem("prune code references", pruneOtpSessions),
    },
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

import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import type { TenancyOption, TenantOtpSent, TenantPortalSession, TenantSignedIn } from "@/lib/contracts";
import { currentMonthKey } from "@/lib/dates";
import { canUseTenantPortal, tenantDisplayName } from "@/lib/domain/tenant";
import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import type { Tenant, TenantSession } from "@/lib/types";
import {
  TENANT_PORTAL_LIMITS,
  tenancyChoiceSchema,
  tenantOtpSendSchema,
  tenantOtpVerifySchema,
} from "@/lib/validation";
import { devLoginEnabled, tenantMessagingEnabled } from "@/server/env";
import { afterResponse, auth, messaging, systemDb, tenantCookie } from "@/server/infra";
import { hashToken, keyedHash } from "@/server/token";
import { recordSystemEvent } from "./audit";
import {
  DAY,
  enforceRateLimits,
  loggableError,
  notFound,
  parseInput,
  RATE_LIMITS,
  type RequestMeta,
  type TenantContext,
} from "./context";
import { currentTenancies } from "./placements";

// The tenant portal's sign-in (A32): a tenant proves they hold the phone the
// owner recorded (an SMS code through Twilio Verify) and gets a session of
// their own - a random token in an HttpOnly cookie, its hash in
// tenant_sessions. Tenants are not Supabase Auth users, so no owner path,
// owner policy or owner function can ever see a tenant session as an owner.
// Who may sign in: canUseTenantPortal (active tenants, and moved-out ones for
// TENANT_PORTAL_LIMITS.movedOutAccessMonths).
//
// Nothing here may tell a stranger whether a number is a tenant's: "send
// code" answers at once and texts in the background; a failed check takes at
// least VERIFY_MIN_MS whether or not Twilio was asked.

/** A session's absolute lifetime: a week, then the tenant signs in again. */
const TENANT_SESSION_DAYS = 7;

/** Development without Twilio (ALLOW_DEV_LOGIN, never in production): the code that signs in. */
const DEV_TENANT_OTP = "000000";

/** A failed code check never answers sooner than this, so it can't be timed against Twilio's reply. */
const VERIFY_MIN_MS = 800;

/** Characters kept of a keyed hash in a rate-limit key, and in the audit log's IP hash. */
const PHONE_KEY_CHARS = 24;
const IP_KEY_CHARS = 24;
const IP_LOG_CHARS = 12;

const WRONG_CODE = "That code is wrong or has expired. Check it, or send a new one.";

/** Development's stand-in for Twilio. */
function devOtp(): boolean {
  return !tenantMessagingEnabled() && devLoginEnabled();
}

function requireOtpAvailable(): void {
  if (!tenantMessagingEnabled() && !devLoginEnabled()) {
    throw new ApiError(503, "Signing in with your phone isn't available yet. Ask your landlord for your receipts.");
  }
}

// Keyed hashes: never the number or the IP itself in a key or a log.
const phoneKey = (phone: string) => keyedHash(phone).slice(0, PHONE_KEY_CHARS);
const ipKey = (meta: RequestMeta) => keyedHash(meta.ip).slice(0, IP_KEY_CHARS);
const ipLog = (meta: RequestMeta) => keyedHash(meta.ip).slice(0, IP_LOG_CHARS);

/** The tenancies this phone may open now, oldest first. */
async function portalTenancies(phone: string): Promise<Tenant[]> {
  const thisMonth = currentMonthKey();
  const tenants = await systemDb().tenants.listByPhone(phone);
  return tenants.filter((t) => canUseTenantPortal(t, TENANT_PORTAL_LIMITS.movedOutAccessMonths, thisMonth));
}

/**
 * Sends a sign-in code to `phone` if a tenant has that number. The answer is
 * the same, and as quick, either way: the SMS goes out after the response,
 * so the form can't be used to find out who is a tenant.
 */
export async function sendTenantOtp(body: unknown, meta: RequestMeta): Promise<TenantOtpSent> {
  const { phone } = parseInput(tenantOtpSendSchema, body);
  requireOtpAvailable();
  await enforceRateLimits([
    { key: `tenant-otp:phone:${phoneKey(phone)}`, ...RATE_LIMITS.tenantOtpPerPhoneShort },
    { key: `tenant-otp-hour:phone:${phoneKey(phone)}`, ...RATE_LIMITS.tenantOtpPerPhone },
    { key: `tenant-otp-day:phone:${phoneKey(phone)}`, ...RATE_LIMITS.tenantOtpPerPhoneDay },
    { key: `tenant-otp:ip:${ipKey(meta)}`, ...RATE_LIMITS.tenantOtpPerIp },
  ]);

  if (devOtp()) return { devCode: DEV_TENANT_OTP };
  const tenants = await portalTenancies(phone);
  if (tenants.length === 0) return {};

  afterResponse.run(async () => {
    try {
      // The cap on all codes counts only real sends; past it, nothing is sent and the owner's log says why.
      const allowed = await systemDb().rateLimits.hit(
        "tenant-otp-day",
        RATE_LIMITS.tenantOtpPerDay.limit,
        RATE_LIMITS.tenantOtpPerDay.windowSeconds
      );
      if (!allowed) {
        console.error("tenant sendOtp: the daily cap on sign-in codes is used up; not sent");
        return;
      }
      await messaging.sendOtp(phone);
    } catch (err) {
      console.error("tenant sendOtp:", loggableError(err));
    }
  });
  return {};
}

/** Whether `code` is the one just sent to `phone`. A Twilio failure counts as a wrong code (logged). */
async function codeMatches(phone: string, code: string): Promise<boolean> {
  if (devOtp()) return code === DEV_TENANT_OTP;
  try {
    return await messaging.checkOtp(phone, code);
  } catch (err) {
    console.error("tenant checkOtp:", loggableError(err));
    return false;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Checks the SMS code and signs the tenant in: a new session, its cookie,
 * and any owner session in this browser ended (one identity per browser).
 * Goes to the tenant page, or to the picker when the phone has several
 * tenancies.
 */
export async function verifyTenantOtp(body: unknown, meta: RequestMeta): Promise<TenantSignedIn> {
  const { phone, code } = parseInput(tenantOtpVerifySchema, body);
  requireOtpAvailable();
  await enforceRateLimits([
    { key: `tenant-verify:phone:${phoneKey(phone)}`, ...RATE_LIMITS.tenantVerifyPerPhone },
    { key: `tenant-verify-day:phone:${phoneKey(phone)}`, ...RATE_LIMITS.tenantVerifyPerPhoneDay },
    { key: `tenant-verify:ip:${ipKey(meta)}`, ...RATE_LIMITS.tenantVerifyPerIp },
  ]);

  const started = Date.now();
  const tenants = await portalTenancies(phone);
  // An unknown number never reaches Twilio, and gets the same answer, no sooner, as a wrong code.
  if (tenants.length === 0 || !(await codeMatches(phone, code))) {
    await sleep(Math.max(0, started + VERIFY_MIN_MS - Date.now()));
    await recordSystemEvent({
      action: "auth.sign_in_failed",
      actorKind: "visitor",
      context: { method: "phone_otp", knownPhone: tenants.length > 0, ipHash: ipLog(meta) },
    });
    throw new ApiError(400, WRONG_CODE);
  }

  try {
    await auth.signOut();
  } catch (err) {
    // Signing out of an owner session that may not exist; the tenant sign-in goes on.
    console.error("tenant sign-in: owner sign-out:", loggableError(err));
  }
  await endTenantSession();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TENANT_SESSION_DAYS * DAY * 1000);
  const only = tenants.length === 1 ? tenants[0] : null;
  await systemDb().tenantSessions.create({
    token_hash: hashToken(token),
    phone,
    tenant_id: only?.id ?? null,
    expires_at: expiresAt.toISOString(),
    ip_hash: ipLog(meta),
  });
  await tenantCookie.write(token, expiresAt);
  if (only) await logTenantSignIn(only.id);
  return { next: only ? routes.tenantPortal.home() : routes.tenantPortal.select };
}

async function logTenantSignIn(tenantId: string): Promise<void> {
  await recordSystemEvent({ action: "auth.sign_in", actorKind: "tenant", tenantId, context: { method: "phone_otp" } });
}

/** The live session behind this request's cookie, once per request; null without one. */
const currentSession = cache(async (): Promise<TenantSession | null> => {
  const token = await tenantCookie.read();
  if (!token) return null;
  return systemDb().tenantSessions.findActive(hashToken(token));
});

/** May this session's phone still open `tenant`: its number, and a tenancy the portal is open to. */
function stillAllowed(session: TenantSession, tenant: Tenant | null): tenant is Tenant {
  return (
    tenant !== null &&
    tenant.phone === session.phone &&
    canUseTenantPortal(tenant, TENANT_PORTAL_LIMITS.movedOutAccessMonths, currentMonthKey())
  );
}

/** Ends a session that no longer fits (the owner changed the phone) and refuses the request. */
async function refuse(session: TenantSession): Promise<never> {
  await systemDb().tenantSessions.revoke(session.id);
  await tenantCookie.clear();
  throw new ApiError(401, "Please sign in again");
}

/**
 * The signed-in tenant, for every tenant portal read: 401 without a live
 * session (or once the tenant's phone changed, or their access after moving
 * out ended), 403 while a phone with several tenancies hasn't chosen one
 * (the page sends them to the picker).
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const session = await currentSession();
  if (!session) throw new ApiError(401, "Please sign in");
  if (!session.tenant_id) throw new ApiError(403, "Choose which tenancy to open");
  const tenant = await systemDb().tenants.get(session.tenant_id);
  if (!stillAllowed(session, tenant)) return refuse(session);
  return { sessionId: session.id, tenantId: tenant.id };
});

/** The session with its phone's tenancies, for the picker; 401 without a session, 429 past its rate limit. */
async function sessionWithTenancies(): Promise<{ session: TenantSession; tenants: Tenant[] }> {
  const session = await currentSession();
  if (!session) throw new ApiError(401, "Please sign in");
  await enforceRateLimits([{ key: `tenant:${session.id}`, ...RATE_LIMITS.tenantApiPerMinute }]);
  const tenants = await portalTenancies(session.phone);
  if (tenants.length === 0) return refuse(session);
  return { session, tenants };
}

/** The tenancies this phone may open (/tenant/select), oldest first, each with its houses. */
export async function listTenancies(): Promise<TenancyOption[]> {
  const { tenants } = await sessionWithTenancies();
  const db = systemDb();
  return Promise.all(
    tenants.map(async (t) => ({
      id: t.id,
      displayName: tenantDisplayName(t),
      status: t.status,
      movedOutOn: t.moved_out_on,
      leaseStart: t.lease_start,
      unitCodes: currentTenancies(await db.occupancy.listForTenant(t.id))
        .map((o) => o.unit_code)
        .sort(),
    }))
  );
}

/** Opens one of the phone's tenancies; 404 for any other id. */
export async function selectTenancy(body: unknown): Promise<TenantSignedIn> {
  const { tenantId } = parseInput(tenancyChoiceSchema, body);
  const { session, tenants } = await sessionWithTenancies();
  if (!tenants.some((t) => t.id === tenantId)) notFound("Tenancy");
  if (!(await systemDb().tenantSessions.choose(session.id, tenantId))) throw new ApiError(401, "Please sign in again");
  await logTenantSignIn(tenantId);
  return { next: routes.tenantPortal.home() };
}

/** The portal header: the tenant's name, and whether "Switch" applies. */
export async function getTenantPortalSession(ctx: TenantContext): Promise<TenantPortalSession> {
  const tenant = await systemDb().tenants.get(ctx.tenantId);
  if (!tenant?.phone) throw new ApiError(401, "Please sign in again");
  const tenancies = await portalTenancies(tenant.phone);
  return { displayName: tenantDisplayName(tenant), canSwitch: tenancies.length > 1 };
}

/** Ends this browser's tenant session, if any: the row is revoked and the cookie cleared. Never throws. */
export async function endTenantSession(): Promise<void> {
  try {
    const session = await currentSession();
    if (session) await systemDb().tenantSessions.revoke(session.id);
  } catch (err) {
    console.error("end tenant session:", loggableError(err));
  }
  await tenantCookie.clear();
}

export async function signOutTenant(): Promise<void> {
  const session = await currentSession().catch(() => null);
  if (session?.tenant_id) {
    await recordSystemEvent({ action: "auth.signed_out", actorKind: "tenant", tenantId: session.tenant_id });
  }
  await endTenantSession();
}

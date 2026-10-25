import "server-only";
import { cache } from "react";
import type { LoginOptions, MagicLinkResult, PasswordSignInResult, Session } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { magicLinkSchema, passwordSignInSchema, sessionTokensSchema } from "@/lib/validation";
import { devLoginEnabled, env, ownerEmailAllowlist } from "@/server/env";
import { hashToken } from "@/server/token";
import { auth } from "@/server/infra";
import { safeNext } from "@/lib/redirects";
import { recordSystemEvent } from "./audit";
import { enforceRateLimits, parseInput, RATE_LIMITS, type OwnerContext, type RequestMeta } from "./context";

/**
 * Who is signed in, and whether they're the owner (an `is_app_owner` call).
 * Cached per page render, so the layout and every owner read share one check;
 * a route handler runs it once per request anyway.
 */
export const getSession = cache(async (): Promise<Session> => {
  const session = await auth.getSession();
  if (!session) throw new ApiError(401, "Unauthorized");
  return session;
});

export const NOT_OWNER_MESSAGE = "This account isn't the owner of this rent book";

/**
 * The signed-in owner, for every owner-only read and write: 401 without a
 * session, 403 for a signed-in account that isn't the single app owner. The
 * database enforces the same rule (is_app_owner()); this turns it into a
 * clear answer instead of empty pages.
 */
export async function getOwnerContext(): Promise<OwnerContext> {
  const session = await getSession();
  if (!session.isOwner) throw new ApiError(403, NOT_OWNER_MESSAGE);
  return { ownerId: session.userId, email: session.email };
}

/**
 * Who may sign in: with OWNER_EMAILS set, only those emails (and they may
 * create their account); without it, only accounts that already exist -
 * nobody can sign up as a new owner by just typing an email.
 */
function signInPolicy(email: string): { allowed: boolean; allowSignUp: boolean } {
  const allowlist = ownerEmailAllowlist();
  if (!allowlist) return { allowed: true, allowSignUp: false };
  const listed = allowlist.has(email);
  return { allowed: listed, allowSignUp: listed };
}

export function getLoginOptions(): LoginOptions {
  return { devLogin: devLoginEnabled() };
}

export async function requestMagicLink(body: unknown, meta: RequestMeta): Promise<MagicLinkResult> {
  const { email, next } = parseInput(magicLinkSchema, body);
  await enforceRateLimits([
    { key: `magic-link:email:${hashToken(email)}`, ...RATE_LIMITS.magicLinkPerEmail },
    { key: `magic-link:ip:${meta.ip}`, ...RATE_LIMITS.magicLinkPerIp },
  ]);

  // Lands on the /auth/callback page, which finishes sign-in for both the
  // PKCE (?code=) and the implicit (#access_token=) flows.
  const redirectTo = `${env().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
  const policy = signInPolicy(email);

  if (devLoginEnabled()) {
    // No email provider locally - create the link and hand it back instead
    // of sending it. Needs ALLOW_DEV_LOGIN=1 and is never honoured in a
    // production build.
    if (!policy.allowed) throw new ApiError(403, "That email isn't in OWNER_EMAILS");
    const link = await auth.generateMagicLink(email, redirectTo);
    return { dev: true, link };
  }

  // Same answer whether or not the email may sign in, so the form doesn't
  // reveal who the owners are.
  if (policy.allowed) await auth.sendMagicLink(email, redirectTo, { allowSignUp: policy.allowSignUp });
  return { dev: false };
}

const WRONG_PASSWORD = "Wrong email or password";

/**
 * Owner sign-in with email + password (Supabase Auth). An email outside
 * OWNER_EMAILS gets the same answer as a wrong password, and an account that
 * isn't the app owner is signed straight back out.
 */
export async function signInWithPassword(body: unknown, meta: RequestMeta): Promise<PasswordSignInResult> {
  const { email, password, next } = parseInput(passwordSignInSchema, body);
  await enforceRateLimits([
    { key: `password:email:${hashToken(email)}`, ...RATE_LIMITS.passwordPerEmail },
    { key: `password:ip:${meta.ip}`, ...RATE_LIMITS.passwordPerIp },
  ]);

  const knownEmail = signInPolicy(email).allowed;
  if (!knownEmail || !(await auth.signInWithPassword(email, password))) {
    await logFailedSignIn(meta, { knownEmail, reason: "wrong_password" });
    throw new ApiError(400, WRONG_PASSWORD);
  }

  const session = await auth.getSession();
  if (!session?.isOwner) {
    await auth.signOut();
    await logFailedSignIn(meta, { knownEmail, reason: "not_owner" });
    throw new ApiError(403, NOT_OWNER_MESSAGE);
  }
  await recordSystemEvent({
    action: "auth.sign_in",
    actorKind: "owner",
    actorId: session.userId,
    context: { method: "password" },
  });
  return { next: safeNext(next) };
}

// The audit log keeps neither the email nor the IP: only whether the email
// is an owner's, and a hash that tells repeated attempts from one place apart.
async function logFailedSignIn(meta: RequestMeta, context: { knownEmail: boolean; reason: string }): Promise<void> {
  await recordSystemEvent({
    action: "auth.sign_in_failed",
    actorKind: "visitor",
    context: { method: "password", ...context, ipHash: hashToken(meta.ip).slice(0, 12) },
  });
}

/** An email-link sign-in finished: log it for the owner (another account isn't this rent book's event). */
async function logEmailLinkSignIn(): Promise<void> {
  const session = await auth.getSession();
  if (!session?.isOwner) return;
  await recordSystemEvent({
    action: "auth.sign_in",
    actorKind: "owner",
    actorId: session.userId,
    context: { method: "email_link" },
  });
}

export async function setSessionFromTokens(body: unknown): Promise<void> {
  const { accessToken, refreshToken } = parseInput(sessionTokensSchema, body);
  await auth.setSession(accessToken, refreshToken);
  await logEmailLinkSignIn();
}

export async function exchangeCode(code: string): Promise<void> {
  await auth.exchangeCode(code);
  await logEmailLinkSignIn();
}

export async function signOut(): Promise<void> {
  const session = await auth.getSession();
  if (session?.isOwner) {
    await recordSystemEvent({ action: "auth.signed_out", actorKind: "owner", actorId: session.userId });
  }
  await auth.signOut();
}

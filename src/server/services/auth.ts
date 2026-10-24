import "server-only";
import type { LoginOptions, MagicLinkResult, PasswordSignInResult, Session } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { magicLinkSchema, passwordSignInSchema, sessionTokensSchema } from "@/lib/validation";
import { devLoginEnabled, env, ownerEmailAllowlist } from "@/server/env";
import { hashToken } from "@/server/token";
import { auth } from "@/server/infra";
import { safeNext } from "@/lib/redirects";
import { enforceRateLimits, parseInput, RATE_LIMITS, type OwnerContext, type RequestMeta } from "./context";

export async function getSession(): Promise<Session> {
  const session = await auth.getSession();
  if (!session) throw new ApiError(401, "Unauthorized");
  return session;
}

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

  if (!signInPolicy(email).allowed) throw new ApiError(400, WRONG_PASSWORD);
  if (!(await auth.signInWithPassword(email, password))) throw new ApiError(400, WRONG_PASSWORD);

  const session = await auth.getSession();
  if (!session?.isOwner) {
    await auth.signOut();
    throw new ApiError(403, NOT_OWNER_MESSAGE);
  }
  return { next: safeNext(next) };
}

export async function setSessionFromTokens(body: unknown): Promise<void> {
  const { accessToken, refreshToken } = parseInput(sessionTokensSchema, body);
  await auth.setSession(accessToken, refreshToken);
}

export async function exchangeCode(code: string): Promise<void> {
  await auth.exchangeCode(code);
}

export async function signOut(): Promise<void> {
  await auth.signOut();
}

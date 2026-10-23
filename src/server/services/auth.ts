import "server-only";
import * as z from "zod";
import type { MagicLinkResult, Session } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { auth } from "@/server/infra";
import { parseInput } from "./context";

const isDev = process.env.NODE_ENV !== "production";

const magicLinkSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  next: z.string().optional(),
});

const sessionTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

/** Only same-site paths, so a crafted `next` can't bounce the owner to another site after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function getSession(): Promise<Session> {
  const session = await auth.getSession();
  if (!session) throw new ApiError(401, "Unauthorized");
  return session;
}

export async function requestMagicLink(body: unknown): Promise<MagicLinkResult> {
  const { email, next } = parseInput(magicLinkSchema, body);
  // Lands on the /auth/callback page, which finishes sign-in for both the
  // PKCE (?code=) and the implicit (#access_token=) flows.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

  if (isDev) {
    // No email provider locally - create the link and hand it back instead
    // of sending it. Never reachable when NODE_ENV=production.
    const link = await auth.generateMagicLink(email, redirectTo);
    console.log(`\n[dev] Sign-in link for ${email}:\n${link}\n`);
    return { dev: true, link };
  }

  await auth.sendMagicLink(email, redirectTo);
  return { dev: false };
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

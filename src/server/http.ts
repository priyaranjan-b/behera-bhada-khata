import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { auth } from "@/server/infra";
import type { OwnerContext } from "@/server/services/context";

// Thin adapters from Next.js route handlers to services: auth, JSON in/out
// and error mapping live here so each route.ts is one line per method.

type RouteContext<P> = { params: Promise<P> };
type Result = unknown;

function toResponse(result: Result): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return NextResponse.json({ ok: true });
  return NextResponse.json(result);
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  // Unexpected: log the detail, don't leak it.
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/** Public endpoint (the tenant confirm flow, auth). */
export function publicRoute<P = Record<string, never>>(
  handler: (request: Request, params: P) => Promise<Result>
) {
  return async (request: Request, { params }: RouteContext<P>) => {
    try {
      return toResponse(await handler(request, await params));
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Endpoint for the signed-in owner; 401 without a session. */
export function ownerRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const session = await auth.getSession();
    if (!session) throw new ApiError(401, "Unauthorized");
    return handler({ ownerId: session.userId, email: session.email }, request, params);
  });
}

/** Like ownerRoute, for URLs opened directly in the browser: no session -> the login page. */
export function ownerLinkRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const session = await auth.getSession();
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    return handler({ ownerId: session.userId, email: session.email }, request, params);
  });
}

/** Redirect to a (signed) URL, e.g. a receipt download. */
export function redirectTo(url: string): Response {
  return NextResponse.redirect(url);
}

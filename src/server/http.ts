import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { env } from "@/server/env";
import { auth } from "@/server/infra";
import { getOwnerContext } from "@/server/services/auth";
import { enforceOwnerRateLimit, enforceTenantRateLimit, type TenantContext } from "@/server/services/context";
import { getTenantContext } from "@/server/services/tenantAuth";
import { secretsEqual } from "@/server/token";
import type { OwnerContext, RequestMeta, UploadedFile } from "@/server/services/context";

// Thin adapters from Next.js route handlers to services: auth, JSON in/out
// and error mapping live here so each route.ts is one line per method.

type RouteContext<P> = { params: Promise<P> };
type Result = unknown;

// Owner and tenant data: never kept by a browser, proxy, CDN or service worker (A21, A31).
const NO_STORE = { "Cache-Control": "private, no-store" };

function toResponse(result: Result): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  return NextResponse.json(result, { headers: NO_STORE });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A write sent by a page on another site (CSRF, A31). The session cookie is
 * SameSite=Lax, which already keeps it off cross-site POSTs; this is the
 * second lock. Browsers send `Sec-Fetch-Site` on every request; older ones
 * at least send `Origin` on a POST. A request with neither isn't from a web
 * page (curl, a server), so it carries no browser cookies to abuse.
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "cross-site";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
  // Unexpected: log the detail, don't leak it.
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500, headers: NO_STORE });
}

/** The query string as a plain object, for a service to validate (GET filters). */
export function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/**
 * A JSON body, or a multipart form of a `payload` JSON field plus files under
 * `fileField` (the API client sends that shape when there are files).
 */
export async function readJsonWithFiles(
  request: Request,
  fileField: string
): Promise<{ body: unknown; files: UploadedFile[] }> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return { body: await readJson(request), files: [] };
  }
  const form = await request.formData().catch(() => {
    throw new ApiError(400, "Couldn't read the upload");
  });
  const payload = form.get("payload");
  let body: unknown = null;
  try {
    body = typeof payload === "string" ? JSON.parse(payload) : null;
  } catch {
    // Left null: the service's validation reports it.
  }
  const files = await Promise.all(
    form
      .getAll(fileField)
      .filter((v): v is File => typeof v !== "string")
      .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
  );
  return { body, files };
}

/**
 * Client IP for rate limiting (A17). The last x-forwarded-for hop is the one
 * our own proxy added: Vercel overwrites the header with just the client, and
 * a proxy that appends puts the address it saw last. Earlier hops come from
 * the client and are never trusted, so they can't dodge the per-IP limits.
 */
export function requestMeta(request: Request): RequestMeta {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return { ip: forwarded || request.headers.get("x-real-ip") || "unknown" };
}

/** Public endpoint (the tenant confirm flow, auth). Every route helper below builds on it, so each refuses cross-site writes. */
export function publicRoute<P = Record<string, never>>(
  handler: (request: Request, params: P) => Promise<Result>
) {
  return async (request: Request, { params }: RouteContext<P>) => {
    try {
      if (isCrossSiteWrite(request)) throw new ApiError(403, "Cross-site request refused");
      return toResponse(await handler(request, await params));
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Endpoint for the app owner; 401 without a session, 403 for any other account, 429 past the owner's rate limit. */
export function ownerRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const ctx = await getOwnerContext();
    await enforceOwnerRateLimit(ctx);
    return handler(ctx, request, params);
  });
}

/** Like ownerRoute, for URLs opened directly in the browser: no session -> the login page. */
export function ownerLinkRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const session = await auth.getSession();
    if (!session) return NextResponse.redirect(new URL(routes.login(), request.url));
    if (!session.isOwner) return NextResponse.redirect(new URL(routes.login({ error: "owner" }), request.url));
    const ctx = { ownerId: session.userId, email: session.email };
    await enforceOwnerRateLimit(ctx);
    return handler(ctx, request, params);
  });
}

/**
 * Endpoint for a signed-in tenant (the portal, A32): 401 without a tenant
 * session, 403 until a phone with several tenancies picks one, 429 past the
 * session's rate limit. Reads only: the tenant API has no writes but signing
 * in and out (test/services/tenantRoutes.test.ts checks every route file).
 */
export function tenantRoute<P = Record<string, never>>(
  handler: (ctx: TenantContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const ctx = await getTenantContext();
    await enforceTenantRateLimit(ctx);
    return handler(ctx, request, params);
  });
}

/** Like tenantRoute, for URLs opened directly in the browser (a receipt): no session -> the tenant sign-in page. */
export function tenantLinkRoute<P = Record<string, never>>(
  handler: (ctx: TenantContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    let ctx: TenantContext;
    try {
      ctx = await getTenantContext();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return NextResponse.redirect(new URL(routes.tenantPortal.login, request.url));
      if (err instanceof ApiError && err.status === 403) return NextResponse.redirect(new URL(routes.tenantPortal.select, request.url));
      throw err;
    }
    await enforceTenantRateLimit(ctx);
    return handler(ctx, request, params);
  });
}

/** Scheduled job: requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). */
export function cronRoute(handler: () => Promise<Result>) {
  return publicRoute(async (request) => {
    const secret = env().CRON_SECRET;
    const header = request.headers.get("authorization") ?? "";
    // No secret configured (development) = locked, never open.
    if (!secret || !secretsEqual(header, `Bearer ${secret}`)) throw new ApiError(401, "Unauthorized");
    return handler();
  });
}

/** A file the browser downloads (e.g. a PDF receipt to send on over WhatsApp). */
export function fileResponse(file: { bytes: Uint8Array; fileName: string }, contentType: string): Response {
  return new Response(new Blob([new Uint8Array(file.bytes)], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Redirect to a (signed) URL, e.g. a receipt download. */
export function redirectTo(url: string): Response {
  return NextResponse.redirect(url);
}

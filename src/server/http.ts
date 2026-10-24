import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { env } from "@/server/env";
import { auth } from "@/server/infra";
import { getOwnerContext } from "@/server/services/auth";
import { secretsEqual } from "@/server/token";
import type { OwnerContext, RequestMeta, UploadedFile } from "@/server/services/context";

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
 * Client IP for rate limiting. On Vercel (and most proxies) the first
 * x-forwarded-for hop is the client; elsewhere it's whatever the proxy says.
 */
export function requestMeta(request: Request): RequestMeta {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || request.headers.get("x-real-ip") || "unknown" };
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

/** Endpoint for the app owner; 401 without a session, 403 for any other account. */
export function ownerRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => handler(await getOwnerContext(), request, params));
}

/** Like ownerRoute, for URLs opened directly in the browser: no session -> the login page. */
export function ownerLinkRoute<P = Record<string, never>>(
  handler: (ctx: OwnerContext, request: Request, params: P) => Promise<Result>
) {
  return publicRoute<P>(async (request, params) => {
    const session = await auth.getSession();
    if (!session) return NextResponse.redirect(new URL(routes.login(), request.url));
    if (!session.isOwner) return NextResponse.redirect(new URL(routes.login({ error: "owner" }), request.url));
    return handler({ ownerId: session.userId, email: session.email }, request, params);
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

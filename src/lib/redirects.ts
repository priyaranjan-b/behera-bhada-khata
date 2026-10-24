import { routes } from "@/lib/routes";

/**
 * Only same-site paths, so a crafted `next` can't bounce the owner to another
 * site (or a `javascript:` URL) after sign-in. Pure and client-safe: every
 * redirect target taken from a query param goes through here, server or
 * browser. Control characters are refused because browsers strip them, which
 * would turn "/\t/evil.test" into "//evil.test".
 */
export function safeNext(next: string | null | undefined): string {
  const ok =
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !/[\u0000-\u001f\u007f]/.test(next);
  return ok ? next : routes.home;
}

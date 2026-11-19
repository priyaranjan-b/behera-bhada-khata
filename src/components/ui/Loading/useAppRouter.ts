"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginLoading, beginNavigation } from "./store";

/** The pathname of a router href (`/tenants?x=1` → `/tenants`). */
function pathOf(href: string): string {
  return new URL(href, window.location.href).pathname;
}

/**
 * `useRouter()` whose push / replace / refresh / back run in a transition, so
 * the navigation progress bar shows until the new route has rendered, and for
 * a push / replace to another path, or a back, the full-screen spinner too
 * (A38). A refresh, or a push / replace that keeps the path (a flash param,
 * a filter), never shows it. Use it instead of `next/navigation`'s
 * `useRouter` for anything the user triggered.
 */
export function useAppRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Whether the pending transition opens another page, and its pathname when known (the spinner names it,
  // A38). Set by push / replace / back, never cleared by a refresh in the same transition (the usual
  // `router.push(…); router.refresh()` after a save); reset when the transition ends.
  const changesPage = useRef(false);
  const target = useRef<string | null>(null);

  useEffect(() => {
    if (!isPending) {
      changesPage.current = false;
      target.current = null;
      return;
    }
    return changesPage.current ? beginNavigation(target.current) : beginLoading();
  }, [isPending]);

  const opens = (href: string) => {
    const path = pathOf(href);
    if (path === window.location.pathname) return;
    changesPage.current = true;
    target.current = path;
  };

  return useMemo(
    () => ({
      ...router,
      isPending,
      push: (...args: Parameters<typeof router.push>) => {
        opens(args[0]);
        startTransition(() => router.push(...args));
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        opens(args[0]);
        startTransition(() => router.replace(...args));
      },
      refresh: () => {
        startTransition(() => router.refresh());
      },
      back: () => {
        changesPage.current = true;
        target.current = null;
        startTransition(() => router.back());
      },
    }),
    [router, isPending]
  );
}

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
 * push / replace / back (a page change, not a refresh) the full-screen
 * spinner too (A38). Use it instead of `next/navigation`'s `useRouter` for
 * anything the user triggered.
 */
export function useAppRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Whether the pending transition changes the page (push / replace / back) or only refreshes it,
  // and the pathname it goes to when known (the spinner names it, A38).
  const changesPage = useRef(false);
  const target = useRef<string | null>(null);

  useEffect(
    () => (isPending ? (changesPage.current ? beginNavigation(target.current) : beginLoading()) : undefined),
    [isPending]
  );

  return useMemo(
    () => ({
      ...router,
      isPending,
      push: (...args: Parameters<typeof router.push>) => {
        changesPage.current = true;
        target.current = pathOf(args[0]);
        startTransition(() => router.push(...args));
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        changesPage.current = true;
        target.current = pathOf(args[0]);
        startTransition(() => router.replace(...args));
      },
      refresh: () => {
        changesPage.current = false;
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

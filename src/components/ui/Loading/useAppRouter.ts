"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginLoading } from "./store";

/**
 * `useRouter()` whose push / replace / refresh / back run in a transition, so
 * the navigation progress bar shows until the new route has rendered. Use it
 * instead of `next/navigation`'s `useRouter` for anything the user triggered.
 */
export function useAppRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => (isPending ? beginLoading() : undefined), [isPending]);

  return useMemo(
    () => ({
      ...router,
      isPending,
      push: (...args: Parameters<typeof router.push>) => startTransition(() => router.push(...args)),
      replace: (...args: Parameters<typeof router.replace>) => startTransition(() => router.replace(...args)),
      refresh: () => startTransition(() => router.refresh()),
      back: () => startTransition(() => router.back()),
    }),
    [router, isPending]
  );
}

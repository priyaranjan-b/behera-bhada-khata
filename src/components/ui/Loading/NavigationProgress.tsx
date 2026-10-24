"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Loader from "./Loader";
import { finishNavigation, startNavigation, useIsLoading } from "./store";

// Don't flash the bar for work that finishes almost at once (prefetched
// routes, loading.tsx skeletons).
const SHOW_DELAY_MS = 120;

/** True for a plain left click on a same-origin link that leads somewhere else. */
function isInternalNavigation(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // API links (receipt downloads…) aren't page navigations.
  if (url.pathname.startsWith("/api/")) return false;
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

/**
 * Thin bar along the top of the viewport while the app is busy: any internal
 * link click, Back/Forward, `useAppRouter` transitions and tracked button
 * requests. Mount once, inside a <Suspense> (it reads search params).
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const loading = useIsLoading();

  // A link click or Back/Forward starts a navigation…
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (isInternalNavigation(event)) startNavigation();
    }
    // Capture phase: next/link calls preventDefault() on the way up, which
    // would make every client-side navigation look cancelled.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", startNavigation);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", startNavigation);
    };
  }, []);

  // …which ends once the new route has rendered.
  useEffect(() => {
    finishNavigation();
  }, [pathname, searchParams]);

  if (!loading) return null;
  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.tooltip + 1,
        pointerEvents: "none",
        // Invisible for the first moment, so instant navigations don't flash it.
        opacity: 0,
        animation: `navigationProgressIn 150ms ease ${SHOW_DELAY_MS}ms forwards`,
        "@keyframes navigationProgressIn": { to: { opacity: 1 } },
      }}
    >
      <Loader variant="bar" label="Loading" />
    </Box>
  );
}

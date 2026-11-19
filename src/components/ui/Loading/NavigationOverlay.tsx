"use client";

import Box from "@mui/material/Box";
import Loader from "./Loader";
import { pageTitleOf, useIsNavigating, useNavigationTarget } from "./store";

// A page that's ready within this long (prefetched, or a loading.tsx skeleton)
// never shows the spinner; the top bar (NavigationProgress) covers that moment.
const SHOW_DELAY_MS = 300;

/**
 * The full-screen spinner while a page change takes a while (A38): a card
 * naming the page being opened ("Opening Tenants…", from the names the app
 * registers with registerPageTitle; "Loading…" when unknown) over a light
 * scrim. It covers the server's rendering time; once the page streams, its
 * loading.tsx skeleton takes over. It shows for a menu or
 * bottom-bar link, a breadcrumb, a stat card or any other link, a button that
 * navigates (`LinkButton`, `useAppRouter`), a dialog opened as a route, and
 * Back/Forward. It comes in after SHOW_DELAY_MS and from then blocks taps, so
 * a second tap can't start another navigation; it leaves when the new page
 * renders. A button's own request (a save) keeps its button spinner instead.
 * Mount once, in the root layout.
 */
export default function NavigationOverlay() {
  const navigating = useIsNavigating();
  const title = pageTitleOf(useNavigationTarget());
  if (!navigating) return null;
  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        // Under the top bar (tooltip + 1), over the app's own bars and dialogs.
        zIndex: (theme) => theme.zIndex.tooltip,
        opacity: 0,
        pointerEvents: "none",
        animation: `navigationOverlayIn 180ms ease ${SHOW_DELAY_MS}ms forwards`,
        "@keyframes navigationOverlayIn": {
          from: { opacity: 0, pointerEvents: "none" },
          to: { opacity: 1, pointerEvents: "auto" },
        },
        // Not part of a page transition: it leaves as the new page comes in (globals.css).
        viewTransitionName: "app-loading",
      }}
    >
      <Loader variant="screen" text={title ? `Opening ${title}…` : "Loading…"} />
    </Box>
  );
}

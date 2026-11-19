"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Portal from "@mui/material/Portal";
import { visuallyHidden } from "@mui/utils";
import Loader from "./Loader";
import { pageTitleOf, useIsNavigating, useNavigationTarget } from "./store";

// A page that's ready within this long (prefetched, or a loading.tsx skeleton)
// never shows (or announces) the card; the top bar (NavigationProgress) covers that moment.
const SHOW_DELAY_MS = 300;

/**
 * The full-screen spinner while a page change takes a while (A38): a card
 * naming the page being opened ("Opening Tenants…", from the names the app
 * registers with registerPageTitle; "Loading…" when unknown) over a light
 * scrim. It covers the server's rendering time; once the page streams, its
 * loading.tsx skeleton takes over. It shows for a link to another page (a
 * menu or bottom-bar item, a breadcrumb, a stat card), a button that opens
 * one (`LinkButton`, `useAppRouter`), a dialog opened as a route, and
 * Back/Forward - never for a change of the same page's query (‹ ›, a date
 * form, a filter), a save or a refresh.
 *
 * It comes in after SHOW_DELAY_MS. While shown, the rest of the page is
 * `inert` (no taps, no keyboard), so a second tap can't start another
 * navigation, and the one status line, always mounted, says what is opening.
 * It leaves when the new page renders. Mount once, in the root layout.
 */
export default function NavigationOverlay() {
  const navigating = useIsNavigating();
  const title = pageTitleOf(useNavigationTarget());
  const [delayPassed, setDelayPassed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = navigating && delayPassed;
  const text = title ? `Opening ${title}…` : "Loading…";

  useEffect(() => {
    if (!navigating) return;
    const timer = setTimeout(() => setDelayPassed(true), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setDelayPassed(false);
    };
  }, [navigating]);

  // Everything but the card is inert while it shows: the scrim stops taps, this stops the keyboard too.
  useEffect(() => {
    if (!shown) return;
    const root = rootRef.current;
    const others = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root && !el.inert
    );
    for (const el of others) el.inert = true;
    return () => {
      for (const el of others) el.inert = false;
    };
  }, [shown]);

  return (
    // A direct child of <body>, so making its siblings inert leaves it alone.
    <Portal>
      <Box ref={rootRef}>
        {/* Mounted empty and filled when the card shows, so screen readers announce it then, and only then. */}
        <Box role="status" sx={visuallyHidden}>
          {shown ? text : ""}
        </Box>
        {shown ? (
          <Box
            sx={{
              position: "fixed",
              inset: 0,
              // Under the top bar (tooltip + 1), over the app's own bars and dialogs.
              zIndex: (theme) => theme.zIndex.tooltip,
              animation: "navigationOverlayIn 180ms ease",
              "@keyframes navigationOverlayIn": { from: { opacity: 0 }, to: { opacity: 1 } },
              // Not part of a page transition: it leaves as the new page comes in (globals.css).
              viewTransitionName: "app-loading",
            }}
          >
            <Loader variant="screen" text={text} />
          </Box>
        ) : null}
      </Box>
    </Portal>
  );
}

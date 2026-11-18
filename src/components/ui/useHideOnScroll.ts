"use client";

import { useEffect, useState } from "react";

/** Scrolled less than this from the top, the bar always shows. */
const TOP_ZONE = 64;
/** Ignore jitter: a direction counts once the page moved this far. */
const MIN_DELTA = 8;

interface HideOnScrollState {
  hidden: boolean;
  /** Where the last counted move ended. */
  y: number;
}

/**
 * Hide while scrolling down, show on any scroll up, near the top and at the
 * very bottom of the page (where there's nothing left to make room for).
 */
export function nextHideOnScroll(prev: HideOnScrollState, y: number, maxY: number): HideOnScrollState {
  if (y < TOP_ZONE || y >= maxY - 4) return prev.hidden || prev.y !== y ? { hidden: false, y } : prev;
  const dy = y - prev.y;
  if (Math.abs(dy) < MIN_DELTA) return prev;
  return { hidden: dy > 0, y };
}

/**
 * Whether the phone's bottom bar (and the FAB riding on it) should slide
 * away, as Android apps do while you read down a list (A37). `resetKey` (the
 * pathname) shows it again on every new page.
 */
export function useHideOnScroll(enabled: boolean, resetKey: string): boolean {
  const [state, setState] = useState<HideOnScrollState & { key: string }>({ hidden: false, y: 0, key: resetKey });
  // A new page starts with the bar in view.
  if (state.key !== resetKey) setState({ hidden: false, y: 0, key: resetKey });

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        setState((prev) => {
          const next = nextHideOnScroll(prev, window.scrollY, maxY);
          return next === prev ? prev : { ...next, key: prev.key };
        });
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return enabled && state.hidden;
}

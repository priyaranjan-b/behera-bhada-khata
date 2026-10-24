"use client";

import { useSyncExternalStore } from "react";

// App-wide "something is loading" counter behind <NavigationProgress>.
// Anything long-running (a navigation, a router transition, a button's
// request) takes a token with beginLoading() and calls the returned done().

const tokens = new Set<symbol>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Marks work as started; call the returned function (idempotent) when it ends. */
export function beginLoading(): () => void {
  const token = Symbol("loading");
  tokens.add(token);
  emit();
  return () => {
    if (tokens.delete(token)) emit();
  };
}

// A link click / back-forward has no completion callback: it ends when the
// route changes (finishNavigation, called by <NavigationProgress>) or after a
// safety timeout, whichever comes first.
let endNavigation: (() => void) | null = null;
let navigationTimer: ReturnType<typeof setTimeout> | undefined;
const NAVIGATION_TIMEOUT_MS = 15_000;

export function startNavigation() {
  if (endNavigation) return;
  endNavigation = beginLoading();
  navigationTimer = setTimeout(finishNavigation, NAVIGATION_TIMEOUT_MS);
}

export function finishNavigation() {
  clearTimeout(navigationTimer);
  endNavigation?.();
  endNavigation = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while any navigation, router transition or tracked request is in flight. */
export function useIsLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => tokens.size > 0,
    () => false
  );
}

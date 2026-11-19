"use client";

import { useSyncExternalStore } from "react";

// App-wide "something is loading" counter behind <NavigationProgress>.
// Anything long-running (a navigation, a router transition, a button's
// request) takes a token with beginLoading() and calls the returned done().
// A page change also takes a navigation token (beginNavigation), which
// <NavigationOverlay> shows as the full-screen spinner (A38), naming the
// page it goes to; a button's request or a refresh of the same page never does.

const tokens = new Set<symbol>();
/** Each page change in flight and the pathname it goes to (null: not known, e.g. Back). */
const navigations = new Map<symbol, string | null>();
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

/**
 * Marks a page change to `path` (a pathname, when known) as started; it also
 * counts as loading. Call the returned function when it ends.
 */
export function beginNavigation(path: string | null = null): () => void {
  const token = Symbol("navigation");
  const doneLoading = beginLoading();
  navigations.set(token, path);
  emit();
  return () => {
    if (navigations.delete(token)) emit();
    doneLoading();
  };
}

// A link click / back-forward has no completion callback: it ends when the
// route changes (finishNavigation, called by <NavigationProgress>) or after a
// safety timeout, whichever comes first.
let endNavigation: (() => void) | null = null;
let navigationTimer: ReturnType<typeof setTimeout> | undefined;
const NAVIGATION_TIMEOUT_MS = 15_000;

/**
 * A link click or Back/Forward started. `changesPage` false: only the query of
 * the same page changes (‹ ›, a date form, a filter), which shows the top bar
 * but not the full-screen card (A38).
 */
export function startNavigation(path: string | null = null, changesPage = true) {
  if (endNavigation) return;
  endNavigation = changesPage ? beginNavigation(path) : beginLoading();
  navigationTimer = setTimeout(() => {
    // The card blocked the app all this time: leave a trace of which page never came.
    console.warn(`navigation to ${path ?? "an unknown page"} didn't finish within ${NAVIGATION_TIMEOUT_MS / 1000} s; stopped waiting`);
    finishNavigation();
  }, NAVIGATION_TIMEOUT_MS);
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

/** True while a page change (a link, Back/Forward, a `useAppRouter` push / replace / back) is in flight. */
export function useIsNavigating(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigations.size > 0,
    () => false
  );
}

/** The pathname the latest page change in flight goes to; null when none, or not known. */
export function useNavigationTarget(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => [...navigations.values()].at(-1) ?? null,
    () => null
  );
}

// The page's name for a pathname, from whoever knows the routes (the owner
// shell registers its breadcrumb labels), so this kit needn't import the shell.
let pageTitle: ((path: string) => string | null) | null = null;

/** Lets the app name pages for the navigation spinner ("Opening Tenants…"); returns the undo. */
export function registerPageTitle(fn: (path: string) => string | null): () => void {
  pageTitle = fn;
  return () => {
    if (pageTitle === fn) pageTitle = null;
  };
}

/** The registered name of the page at `path`, or null when none is registered or it has no name. */
export function pageTitleOf(path: string | null): string | null {
  return path && pageTitle ? pageTitle(path) : null;
}

/** True while any navigation, router transition or tracked request is in flight. */
export function useIsLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => tokens.size > 0,
    () => false
  );
}

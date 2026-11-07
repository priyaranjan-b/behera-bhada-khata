"use client";

import { useEffect, useRef } from "react";

/** Typing waits this long before the table (or the server) filters. */
export const TYPE_DELAY_MS = 300;

/**
 * Commits a typed `value` `TYPE_DELAY_MS` after the last keystroke, so a
 * server table isn't asked per letter (A30). `flush` (the field's `onBlur`)
 * commits what is still waiting at once: tapping "Show N rows", ✕ or the
 * backdrop takes focus from the field first, so nothing typed is lost.
 * Nothing is committed on unmount: a page navigated away from mid-typing
 * writes nothing, and a control remounted by "Clear all" drops its wait.
 * `initial` is the committed value the field started from.
 */
export function useDelayedCommit(value: string, initial: string, commit: (value: string) => void) {
  const commitRef = useRef(commit);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    if (value === initial && pending.current === null) return;
    pending.current = value;
    timer.current = setTimeout(() => {
      pending.current = null;
      commitRef.current(value);
    }, TYPE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `initial` is the starting value only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return {
    flush() {
      if (pending.current === null) return;
      if (timer.current) clearTimeout(timer.current);
      const waiting = pending.current;
      pending.current = null;
      commitRef.current(waiting);
    },
  };
}

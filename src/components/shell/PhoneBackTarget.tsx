"use client";

import { useEffect } from "react";
import { useBackTarget } from "./BackTargetProvider";

/**
 * Rendered by a page whose URL parent isn't where it is opened from: the
 * phone top bar's ← goes to `href` instead (A37). Cleared when the page goes.
 */
export function PhoneBackTarget({ href, label }: { href: string; label: string }) {
  const { setTarget } = useBackTarget();
  useEffect(() => {
    setTarget({ href, label });
    return () => setTarget(null);
  }, [href, label, setTarget]);
  return null;
}

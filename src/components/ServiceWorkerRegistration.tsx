"use client";

import { useEffect } from "react";
import { IS_PRODUCTION_BUILD } from "@/lib/publicEnv";

/**
 * Registers public/sw.js, which shows an offline page when a page can't load
 * (it never caches owner data). Production builds only, so `next dev` never
 * runs behind a stale worker. Renders nothing; mounted once in app/layout.tsx.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!IS_PRODUCTION_BUILD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
      // Not fatal: the app works the same without it, just no offline page.
      console.warn("Service worker registration failed", error);
    });
  }, []);
  return null;
}

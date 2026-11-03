// Service worker for the installed app (registered by
// src/components/ServiceWorkerRegistration.tsx, production builds only).
//
// It does one thing: when a page can't load because the phone is offline, it
// shows /offline.html instead of the browser's error. It never caches pages,
// API responses or files: rent figures must always be live, and nothing of the
// owner's may stay on the device after sign-out. Pages and /api always go to
// the network.
//
// Bump VERSION when offline.html or the icon changes, so phones fetch them again.
const VERSION = "v1";
const OFFLINE_CACHE = `offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)));
      // Start the page request while the worker boots, so it adds no delay.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // Only full page loads; everything else (API, scripts, images) is untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        return preloaded ?? (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) ?? Response.error();
      }
    })()
  );
});

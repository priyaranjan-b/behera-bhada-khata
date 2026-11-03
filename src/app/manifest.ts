import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { appChrome } from "@/theme/appTokens";

// Makes the app installable ("Add to Home screen" / "Install app"): it then
// opens full screen from its own icon. Icons are rendered by
// scripts/generate-pwa-icons.mjs. Served at /manifest.webmanifest, which the
// proxy lets through without a session (the login page needs it too).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: appChrome.splash,
    theme_color: appChrome.light,
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

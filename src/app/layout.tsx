import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Oriya } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Suspense } from "react";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ThemeRegistry from "@/components/ThemeRegistry";
import NavigationProgress from "@/components/ui/Loading/NavigationProgress";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { appChrome } from "@/theme/appTokens";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Only used for the Odia brand line (see OdiaText), so don't block first paint on it.
const notoOriya = Noto_Sans_Oriya({
  variable: "--font-oriya",
  subsets: ["oriya"],
  preload: false,
});

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  description: APP_DESCRIPTION,
  // Opened from the iPhone home screen: full screen, with this name under the
  // icon (apple-icon.png). Android reads app/manifest.ts instead.
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// The status bar / browser bar colour, matching the header in each scheme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: appChrome.light },
    { media: "(prefers-color-scheme: dark)", color: appChrome.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: InitColorSchemeScript sets the color-scheme
    // attribute on <html> before React hydrates.
    <html lang="en" className={`${inter.variable} ${notoOriya.variable}`} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data-mui-color-scheme" />
        <ThemeRegistry>
          {/* Reads search params, so it needs its own boundary to keep pages static-renderable. */}
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
        </ThemeRegistry>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

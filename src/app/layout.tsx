import type { Metadata } from "next";
import { Inter, Noto_Sans_Oriya } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { Suspense } from "react";
import ThemeRegistry from "@/components/ThemeRegistry";
import NavigationProgress from "@/components/ui/Loading/NavigationProgress";
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
  title: "MyRentHQ",
  applicationName: "MyRentHQ",
  description: "Digital rent ledger with mutual sign-off",
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
      </body>
    </html>
  );
}

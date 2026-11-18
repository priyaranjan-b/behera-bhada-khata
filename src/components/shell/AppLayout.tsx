"use client";

import { ViewTransition } from "react";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { SideMenu } from "@/components/shell/SideMenu";
import { AppNavbar } from "@/components/shell/AppNavbar";
import { hasRecordPaymentFab, MOBILE_NAVBAR_HEIGHT } from "@/components/shell/nav";
import { BOTTOM_NAV_CLEARANCE } from "@/components/ui/BottomNavBar";
import { FAB_PAGE_CLEARANCE } from "@/components/ui/FloatingActionButton";
import { BackTargetProvider } from "@/components/shell/BackTargetProvider";
import { Header } from "@/components/shell/Header";
import { AppBreadcrumbs } from "@/components/shell/AppBreadcrumbs";
import { appCanvasSx } from "@/components/shell/surface";
import type { AppTab } from "@/components/shell/nav";

export type { AppTab } from "@/components/shell/nav";

/** View-transition classes per navigation type; the animations are in globals.css. */
const PAGE_TRANSITION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" };

/**
 * Master app frame, built on the MUI Dashboard template: permanent side menu
 * and search top bar on desktop, top bar + slide-out menu on phones, and a
 * <main> holding URL-derived breadcrumbs above the injected page content.
 */
export default function AppLayout({
  children,
  currentTab,
  ownerEmail,
  ownerName,
}: {
  children: React.ReactNode;
  currentTab?: AppTab;
  ownerEmail?: string;
  ownerName?: string;
}) {
  const pathname = usePathname();
  // The page's own route, following the `children` slots: a dialog opened in a
  // parallel slot over the page (Record payment over the tenant, an
  // intercepted route) changes the URL but not this, so the page underneath
  // keeps its tabs and tables. Search params aren't in it either.
  const pageKey = useSelectedLayoutSegments().join("/");
  return (
    <BackTargetProvider>
      {/* flexShrink 0: <body> is a full-height flex column (globals.css), and with an explicit
          minHeight this frame would otherwise shrink to the window height and let long pages
          overflow it - taking the sticky top bar (bounded by <main>) away after one screen. */}
      <Box sx={{ display: "flex", minHeight: "100dvh", flexShrink: 0 }}>
        <Box
          component="a"
          href="#main-content"
          sx={{
            position: "absolute",
            left: 16,
            top: -48,
            zIndex: (t) => t.zIndex.tooltip,
            px: 2,
            py: 1,
            borderRadius: 1,
            bgcolor: "text.primary",
            color: "background.default",
            fontWeight: 600,
            textDecoration: "none",
            "&:focus": { top: 16 },
          }}
        >
          Skip to main content
        </Box>

        <SideMenu currentTab={currentTab} ownerEmail={ownerEmail} ownerName={ownerName} />
        <AppNavbar currentTab={currentTab} ownerEmail={ownerEmail} ownerName={ownerName} />

        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ flexGrow: 1, minWidth: 0, outline: "none", ...appCanvasSx }}
        >
          <Header />
          {/* useFlexGap: gap skips the breadcrumbs hidden on phones; margins wouldn't. */}
          <Stack
            spacing={2}
            useFlexGap
            sx={{
              mx: { xs: 2, sm: 3 },
              // Phones: the page ends above the bottom menu bar (A33), with the usual
              // gap, and above the Record payment button where there is one (A37).
              pb: {
                xs: hasRecordPaymentFab(pathname) ? FAB_PAGE_CLEARANCE : `calc(${BOTTOM_NAV_CLEARANCE} + 24px)`,
                md: 6,
              },
              pt: { xs: `${MOBILE_NAVBAR_HEIGHT + 16}px`, md: 3 },
              maxWidth: { sm: "100%", md: 1700 },
            }}
          >
            <AppBreadcrumbs />
            {/* Keyed by the page's route (pageKey) so each navigation enters and
                exits (A37): a short crossfade, plus a slide on phones for ← back
                and into a record. Refreshes, filters and dialogs don't animate. */}
            <ViewTransition
              key={pageKey}
              enter={PAGE_TRANSITION}
              exit={PAGE_TRANSITION}
              default="none"
            >
              <Box>{children}</Box>
            </ViewTransition>
          </Stack>
        </Box>
      </Box>
    </BackTargetProvider>
  );
}

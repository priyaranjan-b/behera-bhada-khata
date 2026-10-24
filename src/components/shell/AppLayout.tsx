"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { SideMenu } from "@/components/shell/SideMenu";
import { AppNavbar, MOBILE_NAVBAR_HEIGHT } from "@/components/shell/AppNavbar";
import { Header } from "@/components/shell/Header";
import { AppBreadcrumbs } from "@/components/shell/AppBreadcrumbs";
import type { AppTab } from "@/components/shell/nav";

export type { AppTab } from "@/components/shell/nav";

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
  return (
    // flexShrink 0: <body> is a full-height flex column (globals.css), and with an explicit
    // minHeight this frame would otherwise shrink to the window height and let long pages
    // overflow it - taking the sticky top bar (bounded by <main>) away after one screen.
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
        sx={{ flexGrow: 1, minWidth: 0, bgcolor: "background.default", outline: "none" }}
      >
        <Header />
        <Stack
          spacing={2}
          sx={{
            mx: { xs: 2, sm: 3 },
            pb: 6,
            pt: { xs: `${MOBILE_NAVBAR_HEIGHT + 16}px`, md: 3 },
            maxWidth: { sm: "100%", md: 1700 },
          }}
        >
          <AppBreadcrumbs />
          <Box>{children}</Box>
        </Stack>
      </Box>
    </Box>
  );
}

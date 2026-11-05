"use client";

import Box from "@mui/material/Box";
import AppCard from "@/components/ui/AppCard";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ColorModeIconDropdown from "@/theme/ColorModeIconDropdown";
import { brand } from "@/theme/themePrimitives";

const WIDTHS = { sm: 440, md: 520, lg: 1040 } as const;

/**
 * Frame for pages outside the dashboard (login, auth callback, tenant
 * confirm): soft brand backdrop, colour-mode switch top-right, and a
 * centred column of a fixed width.
 */
export function PublicLayout({
  width = "md",
  align = "center",
  children,
}: {
  width?: keyof typeof WIDTHS;
  /** `top` for long, scrolling pages such as the confirm receipt. */
  align?: "center" | "top";
  children: React.ReactNode;
}) {
  return (
    <>
      <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 1 }}>
        <ColorModeIconDropdown aria-label="Change color mode" />
      </Box>
      <Stack
        component="main"
        sx={[
          {
            minHeight: "100dvh",
            justifyContent: align === "center" ? "center" : "flex-start",
            position: "relative",
            isolation: "isolate",
            px: 2,
            py: { xs: 4, sm: 6 },
          },
          (theme) => ({
            "&::before": {
              content: '""',
              position: "absolute",
              zIndex: -1,
              inset: 0,
              backgroundRepeat: "no-repeat",
              backgroundImage: `radial-gradient(ellipse at 50% 50%, ${brand[50]}, ${(theme.vars || theme).palette.background.default})`,
              ...theme.applyStyles("dark", {
                backgroundImage: `radial-gradient(at 50% 50%, color-mix(in srgb, ${brand[800]} 50%, transparent), ${(theme.vars || theme).palette.background.default})`,
              }),
            },
          }),
        ]}
      >
        <Box sx={{ width: "100%", maxWidth: WIDTHS[width], mx: "auto" }}>{children}</Box>
      </Stack>
    </>
  );
}

/** Outlined card used for the sign-in / status panels on public pages. */
export function PublicCard({ children }: { children: React.ReactNode }) {
  return (
    <AppCard sx={{ width: "100%", maxWidth: WIDTHS.sm, mx: "auto", p: { xs: 2.5, sm: 4 } }}>
      <Stack spacing={3}>{children}</Stack>
    </AppCard>
  );
}

/** h1 + supporting line for public pages (the dashboard uses PageHeader). */
export function PublicHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <Stack spacing={0.5}>
      <Typography component="h1" variant="h4">
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="textSecondary">
          {subtitle}
        </Typography>
      ) : null}
    </Stack>
  );
}

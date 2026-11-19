"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

const SPINNER_SIZE = { sm: 16, md: 24, lg: 40 } as const;

export interface LoaderProps {
  /**
   * `spinner`: inline circular indicator (buttons, small areas).
   * `bar`: thin indeterminate line (top of the page or a card).
   * `overlay`: dims its positioned parent and centres a spinner over it.
   * `screen`: fills its parent with a light scrim and centres a card with a
   * spinner and `text` ("Opening Tenants…"; the page-change spinner,
   * `NavigationOverlay`, A38, which announces it in its own status line, so
   * pass no `label` there).
   */
  variant?: "spinner" | "bar" | "overlay" | "screen";
  size?: keyof typeof SPINNER_SIZE;
  /** Announced to screen readers; omit when a parent already says what's loading. */
  label?: string;
  /** `screen` only: the card's text (default "Loading…"). */
  text?: string;
}

/**
 * The one loading visual in the app. Every busy state (buttons, the
 * navigation bar, overlays) renders through here, so restyling loading -
 * a branded animation, different timing - is a change in this file only.
 */
export default function Loader({ variant = "spinner", size = "md", label, text }: LoaderProps) {
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true };

  if (variant === "bar") {
    return <LinearProgress {...a11y} color="primary" sx={{ height: 3, bgcolor: "transparent" }} />;
  }

  const spinner = <CircularProgress color="inherit" size={SPINNER_SIZE[size]} thickness={4.5} />;

  if (variant === "screen") {
    const message = text ?? "Loading…";
    return (
      <Box
        {...a11y}
        sx={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          px: 2,
          // The page shows through, lightly faded: it is still there, just not ready to use.
          bgcolor: (theme) => `color-mix(in srgb, ${(theme.vars || theme).palette.background.default} 40%, transparent)`,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            minWidth: 200,
            maxWidth: "100%",
            px: 3,
            py: 2,
            borderRadius: 3,
            bgcolor: "background.paper",
            boxShadow: 6,
            // Comes in as a Material dialog does: a short fade and scale (just the fade with reduced motion).
            animation: "loaderCardIn 180ms ease-out",
            "@keyframes loaderCardIn": { from: { transform: "scale(0.96)" }, to: { transform: "none" } },
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <Box component="span" aria-hidden sx={{ display: "inline-flex", color: "primary.main", flexShrink: 0 }}>
            <CircularProgress color="inherit" size={SPINNER_SIZE.md} thickness={4.5} />
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
            {message}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (variant === "overlay") {
    return (
      <Box
        {...a11y}
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          display: "grid",
          placeItems: "center",
          color: "primary.main",
          bgcolor: "action.disabledBackground",
          backdropFilter: "blur(1px)",
          borderRadius: "inherit",
        }}
      >
        {spinner}
      </Box>
    );
  }

  return (
    <Box component="span" {...a11y} sx={{ display: "inline-flex", color: "inherit" }}>
      {spinner}
    </Box>
  );
}

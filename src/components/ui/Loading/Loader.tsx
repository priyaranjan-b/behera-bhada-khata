"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";

const SPINNER_SIZE = { sm: 16, md: 24, lg: 40 } as const;

export interface LoaderProps {
  /**
   * `spinner`: inline circular indicator (buttons, small areas).
   * `bar`: thin indeterminate line (top of the page or a card).
   * `overlay`: dims its positioned parent and centres a spinner over it.
   */
  variant?: "spinner" | "bar" | "overlay";
  size?: keyof typeof SPINNER_SIZE;
  /** Announced to screen readers; omit when a parent already says what's loading. */
  label?: string;
}

/**
 * The one loading visual in the app. Every busy state (buttons, the
 * navigation bar, overlays) renders through here, so restyling loading -
 * a branded animation, different timing - is a change in this file only.
 */
export default function Loader({ variant = "spinner", size = "md", label }: LoaderProps) {
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true };

  if (variant === "bar") {
    return <LinearProgress {...a11y} color="primary" sx={{ height: 3, bgcolor: "transparent" }} />;
  }

  const spinner = <CircularProgress color="inherit" size={SPINNER_SIZE[size]} thickness={4.5} />;

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

"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const CHIP_COLOR = {
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
  neutral: "default",
} as const;

/** Pastel status pill with a leading dot; the theme colours each tone. */
export function StatusBadge({ tone = "neutral", label }: { tone?: BadgeTone; label: string }) {
  return (
    <Chip
      size="small"
      color={CHIP_COLOR[tone]}
      label={label}
      icon={<Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }} />}
    />
  );
}

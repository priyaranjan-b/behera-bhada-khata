"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";

/** Cards per row from each breakpoint up; phones always swipe. */
export interface StatCardRowColumns {
  sm: number;
  md?: number;
  lg?: number;
}

/**
 * A row of `StatCard`s. On phones one swipeable row (each card about 42% of
 * the screen, so the next one peeks in and says "swipe"), instead of
 * stacking seven cards two by two above the table; from `sm` up, a grid of
 * `columns` cards a row, all the same height.
 */
export default function StatCardRow({
  columns,
  label,
  children,
}: {
  columns: StatCardRowColumns;
  /** Names the row for screen readers, e.g. "Payment totals". */
  label: string;
  children: ReactNode;
}) {
  // Only the phone row scrolls, so only there is it a tab stop (a keyboard scrolls it).
  const swipes = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));
  const template = (n: number | undefined) => (n === undefined ? undefined : `repeat(${n}, minmax(0, 1fr))`);
  return (
    <Box
      role="region"
      aria-label={label}
      tabIndex={swipes ? 0 : undefined}
      sx={{
        display: { xs: "flex", sm: "grid" },
        gridTemplateColumns: { sm: template(columns.sm), md: template(columns.md), lg: template(columns.lg) },
        gap: { xs: 1.5, sm: 2 },
        // Phones: run to the screen edges past the page gutter, snapping card by card.
        overflowX: { xs: "auto", sm: "visible" },
        scrollSnapType: { xs: "x mandatory", sm: "none" },
        scrollPaddingInline: 16,
        mx: { xs: -2, sm: 0 },
        px: { xs: 2, sm: 0 },
        pb: { xs: 0.5, sm: 0 },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        "& > *": { flex: { xs: "0 0 auto" }, width: { xs: "42%", sm: "auto" }, minWidth: { xs: 148, sm: 0 }, scrollSnapAlign: "start" },
      }}
    >
      {children}
    </Box>
  );
}

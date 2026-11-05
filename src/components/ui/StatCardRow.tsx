"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";

/** Space between the phone row's cards, in theme spacing units (8px each). */
const GAP_XS = 1.5;

/** Cards per row from each breakpoint up; phones always swipe. */
export interface StatCardRowColumns {
  sm: number;
  md?: number;
  lg?: number;
}

/**
 * A row of `StatCard`s. On phones one swipeable row (two whole cards and a
 * quarter of the next, which peeks in and says "swipe", the edge fading out,
 * and the page's headline card first), instead of
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
        gap: { xs: GAP_XS, sm: 2 },
        // Phones: run to the screen edges past the page gutter, snapping card by card.
        overflowX: { xs: "auto", sm: "visible" },
        scrollSnapType: { xs: "x mandatory", sm: "none" },
        scrollPaddingInline: 16,
        mx: { xs: -2, sm: 0 },
        px: { xs: 2, sm: 0 },
        pb: { xs: 0.5, sm: 0 },
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        alignItems: "stretch",
        // Phones: two whole cards and a quarter of the next, so the row reads as more to swipe.
        "& > *": {
          flex: { xs: "0 0 auto" },
          width: { xs: `calc((100% - 2 * ${GAP_XS * 8}px) / 2.25)`, sm: "auto" },
          // A floor for very narrow screens (a 320px phone), low enough that a 360px one still shows the peek.
          minWidth: { xs: 128, sm: 0 },
          scrollSnapAlign: "start",
        },
        // ... and the right edge fades out (a mask, so no colour), the other hint the row goes on.
        maskImage: { xs: "linear-gradient(to right, black calc(100% - 24px), transparent)", sm: "none" },
        // The page's headline card (StatCard variant "gradient") first on phones, where the rest is off-screen.
        // Only the visual order: the DOM, and so screen readers and the sm+ grid, keep the page's order.
        "& > [data-emphasis]": { order: { xs: -1, sm: 0 } },
        // Every card as tall as the tallest. StatCard's own `height: 100%` (it fills a Grid cell elsewhere)
        // has nothing definite to resolve against in the phone's flex row, which stops the stretch and
        // leaves each card its content height; `auto` lets the row stretch them. `&&` outranks the card's class.
        "&& > *": { height: "auto" },
        // A failed multi-card section's error card (`AsyncSection wide`) takes the whole row.
        "& > [data-span='row']": { gridColumn: "1 / -1", width: "100%" },
      }}
    >
      {children}
    </Box>
  );
}

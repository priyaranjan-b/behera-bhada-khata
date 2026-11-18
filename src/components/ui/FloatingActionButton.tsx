"use client";

import Fab from "@mui/material/Fab";
import { BOTTOM_NAV_CLEARANCE, BOTTOM_NAV_HEIGHT } from "./BottomNavBar";
import { chromeSx } from "./chromeSx";

/** Space a page with the button leaves at its foot: the bar, the 16px gap, the 48px button and a gap. */
export const FAB_PAGE_CLEARANCE = `calc(${BOTTOM_NAV_CLEARANCE} + 80px)`;

/**
 * A phone screen's main action as an Android floating button (A37): an
 * extended FAB (icon + label) bottom-right, just above the bottom bar, and
 * following it down when the bar slides away (`lowered`). Phones only; wider
 * screens keep the action in the page. A page showing it ends
 * `FAB_PAGE_CLEARANCE` above the screen's foot, so it never covers a pager.
 */
export default function FloatingActionButton({
  label,
  icon,
  onClick,
  lowered = false,
  ...aria
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** The bottom bar is hidden: sit where it was. */
  lowered?: boolean;
  "aria-controls"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "dialog";
}) {
  return (
    <Fab
      variant="extended"
      color="primary"
      onClick={onClick}
      {...aria}
      sx={{
        display: { xs: "inline-flex", md: "none" },
        position: "fixed",
        right: 16,
        bottom: `calc(${BOTTOM_NAV_CLEARANCE} + 16px)`,
        gap: 1,
        ...chromeSx("app-fab"),
        transform: lowered ? `translateY(${BOTTOM_NAV_HEIGHT}px)` : "none",
        transition: (theme) => theme.transitions.create("transform", { duration: theme.transitions.duration.short }),
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      {icon}
      {label}
    </Fab>
  );
}

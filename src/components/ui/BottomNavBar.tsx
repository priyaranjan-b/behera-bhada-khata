"use client";

import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Paper from "@mui/material/Paper";
import Link from "@/components/ui/Link";

/** The bar's height (MUI's BottomNavigation default), without the phone's home-bar inset. */
export const BOTTOM_NAV_HEIGHT = 56;

/** Space a page leaves at its foot on phones so the bar never covers its last row. */
export const BOTTOM_NAV_CLEARANCE = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

export interface BottomNavItem {
  value: string;
  label: string;
  /** May carry a Badge. */
  icon: React.ReactNode;
  /** A page to go to; otherwise the bar's `onChange` (or `onClick`) handles it. */
  href?: string;
  onClick?: () => void;
  /** Id of the panel it shows, for `aria-controls` (page sections). */
  controls?: string;
}

/**
 * The phone navigation bar (A33): fixed to the bottom of the screen, an icon
 * and a label per destination, the current one highlighted, always in view
 * and in thumb reach - the pattern banking and UPI apps use. The owner app's
 * main menu on phones (AppNavbar) and the tenant portal's sections (PageTabs)
 * both use it. Shown below `hideFrom`; wider screens have their own
 * navigation. Five items at most, labels kept short.
 */
export default function BottomNavBar({
  items,
  value,
  onChange,
  label,
  hideFrom,
}: {
  items: BottomNavItem[];
  /** The highlighted item; none when the current page isn't on the bar. */
  value: string | null;
  onChange?: (value: string) => void;
  /** Accessible name of the bar. */
  label: string;
  hideFrom: "sm" | "md";
}) {
  return (
    <Paper
      component="nav"
      aria-label={label}
      elevation={8}
      sx={{
        display: { xs: "block", [hideFrom]: "none" },
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        pb: "env(safe-area-inset-bottom)",
        borderRadius: 0,
      }}
    >
      <BottomNavigation
        showLabels
        value={value}
        onChange={(_, next: string) => onChange?.(next)}
        sx={{ height: BOTTOM_NAV_HEIGHT }}
      >
        {items.map((item) => (
          <BottomNavigationAction
            key={item.value}
            label={item.label}
            value={item.value}
            icon={item.icon}
            onClick={item.onClick}
            aria-controls={item.controls}
            aria-current={item.value === value ? "page" : undefined}
            {...(item.href ? { component: Link, href: item.href } : {})}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}

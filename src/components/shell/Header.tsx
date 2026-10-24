"use client";

import Box from "@mui/material/Box";
import useScrollTrigger from "@mui/material/useScrollTrigger";
import ColorModeIconDropdown from "@/theme/ColorModeIconDropdown";
import { Search } from "./Search";
import { TOPBAR_HEIGHT } from "./nav";
import { topBarGlassSx } from "./surface";

/**
 * Desktop top bar (template Header, as a full-width sticky bar): search in the
 * centre, color-mode switch on the right. Same height as the side menu's brand
 * block so the two bottom borders form one line. Always pinned; frosted glass
 * with a shadow once the page scrolls, so content passes visibly underneath.
 */
export function Header() {
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  return (
    <Box
      component="header"
      sx={[
        {
          display: { xs: "none", md: "grid" },
          gridTemplateColumns: "1fr minmax(240px, 480px) 1fr",
          columnGap: 2,
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          height: TOPBAR_HEIGHT + 1,
          px: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
        },
        (theme) => topBarGlassSx(theme, scrolled),
      ]}
    >
      <Box sx={{ gridColumn: 2 }}>
        <Search showShortcut />
      </Box>
      <Box sx={{ justifySelf: "end" }}>
        <ColorModeIconDropdown aria-label="Change color mode" />
      </Box>
    </Box>
  );
}

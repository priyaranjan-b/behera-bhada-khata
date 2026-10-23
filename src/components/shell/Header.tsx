"use client";

import Box from "@mui/material/Box";
import ColorModeIconDropdown from "@/theme/ColorModeIconDropdown";
import { Search } from "./Search";
import { TOPBAR_HEIGHT } from "./nav";
import { shellSurfaceSx } from "./surface";

/**
 * Desktop top bar (template Header, as a full-width sticky bar): search in the
 * centre, color-mode switch on the right. Same height as the side menu's brand
 * block so the two bottom borders form one line.
 */
export function Header() {
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
        shellSurfaceSx,
      ]}
    >
      <Box sx={{ gridColumn: 2 }}>
        <Search />
      </Box>
      <Box sx={{ justifySelf: "end" }}>
        <ColorModeIconDropdown aria-label="Change color mode" />
      </Box>
    </Box>
  );
}

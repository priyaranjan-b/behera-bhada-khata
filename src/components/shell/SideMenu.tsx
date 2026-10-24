"use client";

import Box from "@mui/material/Box";
import Drawer, { drawerClasses } from "@mui/material/Drawer";
import { BrandMark } from "./BrandMark";
import { MenuContent } from "./MenuContent";
import { OwnerCard } from "./OwnerMenu";
import { SIDEBAR_WIDTH, TOPBAR_HEIGHT, type AppTab } from "./nav";
import { sideMenuBrandBandSx, sideMenuSurfaceSx } from "./surface";

/** Permanent desktop side menu (template SideMenu). Hidden below `md`. */
export function SideMenu({
  currentTab,
  ownerEmail,
  ownerName,
}: {
  currentTab?: AppTab;
  ownerEmail?: string;
  ownerName?: string;
}) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: "none", md: "block" },
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        // No right border: the dark contrast column sets itself apart from the page.
        [`& .${drawerClasses.paper}`]: (theme) => ({
          width: SIDEBAR_WIDTH,
          boxSizing: "border-box",
          borderRight: "none",
          ...sideMenuSurfaceSx(theme),
        }),
      }}
    >
      <Box
        sx={[{ px: 2, height: TOPBAR_HEIGHT + 1, flexShrink: 0, display: "flex", alignItems: "center" }, sideMenuBrandBandSx]}
      >
        <BrandMark />
      </Box>
      <Box sx={{ overflow: "auto", height: "100%", display: "flex", flexDirection: "column" }}>
        <MenuContent currentTab={currentTab} contrast />
      </Box>
      <OwnerCard email={ownerEmail} name={ownerName} />
    </Drawer>
  );
}

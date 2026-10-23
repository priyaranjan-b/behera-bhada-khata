"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer, { drawerClasses } from "@mui/material/Drawer";
import { BrandMark } from "./BrandMark";
import { MenuContent } from "./MenuContent";
import { OwnerCard } from "./OwnerMenu";
import { SIDEBAR_WIDTH, TOPBAR_HEIGHT, type AppTab } from "./nav";
import { shellSurfaceSx } from "./surface";

/** Permanent desktop side menu (template SideMenu). Hidden below `md`. */
export function SideMenu({ currentTab, ownerEmail }: { currentTab?: AppTab; ownerEmail?: string }) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: "none", md: "block" },
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        [`& .${drawerClasses.paper}`]: (theme) => ({ width: SIDEBAR_WIDTH, boxSizing: "border-box", ...shellSurfaceSx(theme) }),
      }}
    >
      <Box sx={{ px: 2, height: TOPBAR_HEIGHT, flexShrink: 0, display: "flex", alignItems: "center" }}>
        <BrandMark />
      </Box>
      <Divider />
      <Box sx={{ overflow: "auto", height: "100%", display: "flex", flexDirection: "column" }}>
        <MenuContent currentTab={currentTab} />
      </Box>
      <OwnerCard email={ownerEmail} />
    </Drawer>
  );
}

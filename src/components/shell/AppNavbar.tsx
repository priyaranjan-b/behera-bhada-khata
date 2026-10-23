"use client";

import { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer, { drawerClasses } from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ColorModeIconDropdown from "@/theme/ColorModeIconDropdown";
import { BrandMark } from "./BrandMark";
import { MenuContent } from "./MenuContent";
import { OwnerAvatar } from "./OwnerMenu";
import { useSignOut } from "./useSignOut";
import { shellSurfaceSx } from "./surface";
import type { AppTab } from "./nav";

export const MOBILE_NAVBAR_HEIGHT = 64;

/** Phone/tablet top bar with a right-hand slide-out menu (template AppNavbar + SideMenuMobile). */
export function AppNavbar({ currentTab, ownerEmail }: { currentTab?: AppTab; ownerEmail?: string }) {
  const [open, setOpen] = useState(false);
  const { signOut, signingOut } = useSignOut();

  return (
    <AppBar
      position="fixed"
      sx={[
        { display: { xs: "flex", md: "none" }, boxShadow: 0, borderBottom: "1px solid", borderColor: "divider" },
        shellSurfaceSx,
      ]}
    >
      <Toolbar sx={{ minHeight: MOBILE_NAVBAR_HEIGHT, gap: 1, px: "12px !important" }}>
        <Stack direction="row" sx={{ mr: "auto", minWidth: 0 }}>
          <BrandMark showOdia={false} iconSize={28} />
        </Stack>
        <ColorModeIconDropdown aria-label="Change color mode" />
        <IconButton size="small" aria-label="Open menu" onClick={() => setOpen(true)}>
          <MenuRoundedIcon />
        </IconButton>
      </Toolbar>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          [`& .${drawerClasses.paper}`]: { backgroundImage: "none", backgroundColor: "background.paper" },
        }}
      >
        <Stack sx={{ width: "min(80dvw, 300px)", height: "100%" }}>
          <Stack direction="row" sx={{ p: 2, gap: 1.5, alignItems: "center" }}>
            <OwnerAvatar email={ownerEmail} size={32} />
            <Typography variant="subtitle2" noWrap>
              {ownerEmail ?? "Owner"}
            </Typography>
          </Stack>
          <Divider />
          <MenuContent currentTab={currentTab} onNavigate={() => setOpen(false)} />
          <Divider />
          <Stack sx={{ p: 2 }}>
            <Button variant="outlined" fullWidth startIcon={<LogoutRoundedIcon />} onClick={signOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    </AppBar>
  );
}

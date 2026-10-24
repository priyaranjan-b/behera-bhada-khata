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
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import Box from "@mui/material/Box";
import Link from "@/components/ui/Link";
import ColorModeIconDropdown from "@/theme/ColorModeIconDropdown";
import { BrandMark } from "./BrandMark";
import { MenuContent } from "./MenuContent";
import { OwnerAvatar } from "./OwnerMenu";
import { Search } from "./Search";
import { useSignOut } from "./useSignOut";
import { shellSurfaceSx } from "./surface";
import type { AppTab } from "./nav";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

export const MOBILE_NAVBAR_HEIGHT = 64;

/**
 * Phone/tablet top bar with a right-hand slide-out menu (template AppNavbar +
 * SideMenuMobile). The search icon swaps the bar for the top-bar search.
 */
export function AppNavbar({
  currentTab,
  ownerEmail,
  ownerName,
}: {
  currentTab?: AppTab;
  ownerEmail?: string;
  ownerName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
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
        {searching ? (
          <>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Search autoFocus onNavigate={() => setSearching(false)} />
            </Stack>
            <IconButton size="small" aria-label="Close search" onClick={() => setSearching(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </>
        ) : (
          <>
            <Stack direction="row" sx={{ mr: "auto", minWidth: 0 }}>
              <BrandMark showOdia={false} iconSize={28} />
            </Stack>
            <IconButton size="small" aria-label="Search" onClick={() => setSearching(true)}>
              <SearchRoundedIcon />
            </IconButton>
            <ColorModeIconDropdown aria-label="Change color mode" />
            <IconButton size="small" aria-label="Open menu" onClick={() => setOpen(true)}>
              <MenuRoundedIcon />
            </IconButton>
          </>
        )}
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
            <OwnerAvatar email={ownerEmail} name={ownerName} size={32} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>
                {ownerName ?? ownerEmail ?? "Owner"}
              </Typography>
              {ownerName && ownerEmail ? (
                <Typography variant="caption" component="p" noWrap color="textSecondary">
                  {ownerEmail}
                </Typography>
              ) : null}
            </Box>
          </Stack>
          <Divider />
          <MenuContent currentTab={currentTab} onNavigate={() => setOpen(false)} />
          <Divider />
          <Stack sx={{ p: 2, gap: 1 }}>
            <Button
              component={Link}
              href="/dashboard/profile"
              variant="outlined"
              fullWidth
              startIcon={<PersonRoundedIcon />}
              onClick={() => setOpen(false)}
            >
              Profile
            </Button>
            <LoadingButton
              variant="outlined"
              fullWidth
              startIcon={<LogoutRoundedIcon />}
              onClick={signOut}
              loading={signingOut}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </LoadingButton>
          </Stack>
        </Stack>
      </Drawer>
    </AppBar>
  );
}

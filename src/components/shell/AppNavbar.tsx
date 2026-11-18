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
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
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
import { usePathname, useSearchParams } from "next/navigation";
import BottomNavBar, { type BottomNavItem } from "@/components/ui/BottomNavBar";
import { useHideOnScroll } from "@/components/ui/useHideOnScroll";
import { RecordPaymentFab } from "@/components/domain/RecordPaymentFab";
import { chromeSx } from "@/components/ui/chromeSx";
import { crumbsForPath } from "./AppBreadcrumbs";
import { useBackTarget } from "./BackTargetProvider";
import { carryPaidDirect, PAID_DIRECT_PARAM } from "@/lib/preferences";
import {
  hasRecordPaymentFab,
  MOBILE_NAVBAR_HEIGHT,
  NAV_ITEMS,
  PAID_DIRECT_TABS,
  PHONE_BAR_TABS,
  type AppTab,
} from "./nav";
import LoadingButton from "@/components/ui/Loading/LoadingButton";
import { routes } from "@/lib/routes";


const MORE = "more";

/**
 * Phone/tablet navigation: a top bar (brand, search, colour mode) and the
 * menu as a bar at the bottom of the screen (A33) - Summary, Tenants,
 * Payments, Defaulters, and More, which slides out the full menu with
 * Profile and Sign out (template SideMenuMobile). The search icon swaps the
 * top bar for the top-bar search.
 *
 * Android-app feel (A37): a page under another page (a tenant, a form) shows
 * ← and its title instead of the brand, ← going to the parent page (or where
 * the page says with `PhoneBackTarget`); the main screens on the bar get a
 * "Record payment" button; the bar slides away while scrolling down.
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
  const paidDirect = useSearchParams().get(PAID_DIRECT_PARAM);
  const pathname = usePathname();
  const crumbs = crumbsForPath(pathname);
  const { target } = useBackTarget();
  // "/" is one crumb, a menu page ("/tenants") two; deeper is a page under another.
  const parent = target ?? (crumbs.length > 2 ? crumbs[crumbs.length - 2] : null);
  const title = crumbs[crumbs.length - 1]?.label;
  const barHidden = useHideOnScroll(!open, pathname);
  // Not over the search results or the open menu.
  const showFab = hasRecordPaymentFab(pathname) && !searching && !open;

  const barItems: BottomNavItem[] = [
    ...PHONE_BAR_TABS.flatMap((tab) => {
      const item = NAV_ITEMS.find((i) => i.tab === tab);
      return item
        ? [
            {
              value: tab,
              label: item.label,
              icon: item.icon,
              href: carryPaidDirect(item.href, PAID_DIRECT_TABS.has(tab), paidDirect),
            },
          ]
        : [];
    }),
    { value: MORE, label: "More", icon: <MoreHorizRoundedIcon />, onClick: () => setOpen(true) },
  ];
  // The page's own item, or More for every other page (it's in there), or More while the menu is open.
  const barValue =
    open || (currentTab !== undefined && !PHONE_BAR_TABS.includes(currentTab)) ? MORE : (currentTab ?? null);

  return (
    <>
      <AppBar
        position="fixed"
        sx={[
          {
            display: { xs: "flex", md: "none" },
            boxShadow: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
            ...chromeSx("app-top-bar"),
          },
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
              {parent?.href ? (
                <Stack direction="row" sx={{ mr: "auto", minWidth: 0, alignItems: "center", gap: 0.5 }}>
                  <IconButton
                    component={Link}
                    href={parent.href}
                    transitionTypes={["nav-back"]}
                    aria-label={`Back to ${parent.label}`}
                    sx={{ ml: -0.5 }}
                  >
                    <ArrowBackRoundedIcon />
                  </IconButton>
                  <Typography variant="h6" component="p" noWrap>
                    {title}
                  </Typography>
                </Stack>
              ) : (
                <Stack direction="row" sx={{ mr: "auto", minWidth: 0 }}>
                  <BrandMark showOdia={false} iconSize={28} />
                </Stack>
              )}
              <IconButton size="small" aria-label="Search" onClick={() => setSearching(true)}>
                <SearchRoundedIcon />
              </IconButton>
              <ColorModeIconDropdown aria-label="Change color mode" />
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
                href={routes.profile()}
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
      {showFab ? <RecordPaymentFab lowered={barHidden} /> : null}
      <BottomNavBar label="Main menu" hideFrom="md" value={barValue} items={barItems} hidden={barHidden} />
    </>
  );
}

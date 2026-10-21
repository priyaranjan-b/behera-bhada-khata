"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Drawer from "@mui/material/Drawer";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ApartmentIcon from "@mui/icons-material/Apartment";
import GroupsIcon from "@mui/icons-material/Groups";
import LogoutIcon from "@mui/icons-material/Logout";
import Link from "@/components/Link";

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  { href: "/dashboard", label: "Summary", icon: <SpaceDashboardIcon /> },
  { href: "/dashboard/properties", label: "Properties", icon: <ApartmentIcon /> },
  { href: "/dashboard/tenants", label: "Tenants", icon: <GroupsIcon /> },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 3, py: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          Behera Bhada Khata
        </Typography>
        <Typography variant="caption" color="textSecondary">
          ବେହେରା ଭଡ଼ା ଖାତା
        </Typography>
      </Box>
      <List sx={{ px: 1.5, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={active}
              onClick={() => setMobileOpen(false)}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: active ? "primary.main" : "text.secondary" }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500 } } }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          startIcon={<LogoutIcon />}
          color="inherit"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {!isDesktop && (
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Toolbar>
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Behera Bhada Khata
            </Typography>
          </Toolbar>
        </AppBar>
      )}

      <Drawer
        variant={isDesktop ? "permanent" : "temporary"}
        open={isDesktop ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ root: { keepMounted: true } }}
        sx={{
          width: isDesktop ? DRAWER_WIDTH : undefined,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          bgcolor: "background.default",
          minHeight: "100vh",
          ...(!isDesktop && { pt: 8 }),
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}

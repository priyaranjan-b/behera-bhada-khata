"use client";

import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@/components/ui/Link";
import { brand } from "@/theme/themePrimitives";
import { NAV_ITEMS, type AppTab } from "./nav";

/** CoreUI-style items on the dark desktop side menu (SideMenu); the phone drawer keeps the light look. */
const contrastItemSx = {
  my: 0.25,
  borderRadius: "8px",
  color: "rgba(255, 255, 255, 0.6)",
  "& .MuiListItemIcon-root": { color: "rgba(255, 255, 255, 0.45)" },
  "&:hover": { color: "#FFFFFF", backgroundColor: "rgba(255, 255, 255, 0.05)" },
  "&:hover .MuiListItemIcon-root": { color: "rgba(255, 255, 255, 0.8)" },
  // `&&` outranks the template's `.MuiListItem-root .Mui-selected` rule.
  "&&.Mui-selected, &&.Mui-selected:hover": {
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    boxShadow: `inset 3px 0 0 ${brand[300]}`,
  },
  "&&.Mui-selected .MuiListItemIcon-root": { color: brand[200] },
} as const;

export function MenuContent({
  currentTab,
  onNavigate,
  contrast = false,
}: {
  currentTab?: AppTab;
  onNavigate?: () => void;
  /** Light-on-dark items for the desktop contrast side menu. */
  contrast?: boolean;
}) {
  return (
    <Stack component="nav" aria-label="Primary" sx={{ flexGrow: 1, p: 1 }}>
      {contrast ? (
        <Typography
          variant="caption"
          component="p"
          sx={{ px: 1.5, pt: 1.5, pb: 0.5, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255, 255, 255, 0.38)" }}
        >
          MENU
        </Typography>
      ) : null}
      <List dense>
        {NAV_ITEMS.map((item) => {
          const active = item.tab === currentTab;
          return (
            <ListItem key={item.tab} disablePadding sx={{ display: "block" }}>
              <ListItemButton
                component={Link}
                href={item.href}
                selected={active}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                sx={(theme) => (contrast ? contrastItemSx : {
                  "&.Mui-selected .MuiListItemIcon-root": { color: (theme.vars || theme).palette.primary.main },
                  // Light mode: the active item takes the slate canvas colour on the white side menu.
                  // `&&` outranks the template's `.MuiListItem-root .Mui-selected` rule.
                  "&&.Mui-selected, &&.Mui-selected:hover": theme.applyStyles("light", {
                    backgroundColor: (theme.vars || theme).palette.background.default,
                    color: (theme.vars || theme).palette.primary.main,
                  }),
                })}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Stack>
  );
}

"use client";

import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Link from "@/components/Link";
import { NAV_ITEMS, type AppTab } from "./nav";

export function MenuContent({ currentTab, onNavigate }: { currentTab?: AppTab; onNavigate?: () => void }) {
  return (
    <Stack component="nav" aria-label="Primary" sx={{ flexGrow: 1, p: 1 }}>
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
                sx={(theme) => ({
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

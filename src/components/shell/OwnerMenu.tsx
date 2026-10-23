"use client";

import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { useSignOut } from "./useSignOut";

export function OwnerAvatar({ email, size = 36 }: { email?: string; size?: number }) {
  return (
    <Avatar
      variant="soft"
      sx={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(email?.[0] ?? "O").toUpperCase()}
    </Avatar>
  );
}

/** Owner card pinned to the bottom of the side menu, with Sign out in an options menu. */
export function OwnerCard({ email }: { email?: string }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { signOut, signingOut } = useSignOut();
  const open = Boolean(anchorEl);

  return (
    <Stack direction="row" sx={{ p: 2, gap: 1, alignItems: "center", borderTop: "1px solid", borderColor: "divider" }}>
      <OwnerAvatar email={email} />
      <Box sx={{ mr: "auto", minWidth: 0 }}>
        <Typography variant="body2">
          Owner
        </Typography>
        <Typography variant="caption" noWrap component="p" color="textSecondary" title={email}>
          {email ?? "Signed in"}
        </Typography>
      </Box>
      <IconButton
        size="small"
        aria-label="Account options"
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        aria-controls={open ? "owner-menu" : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{ borderColor: "transparent" }}
      >
        <MoreVertRoundedIcon />
      </IconButton>
      <Menu
        id="owner-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: "right", vertical: "bottom" }}
        anchorOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{ "& .MuiList-root": { p: "4px" }, "& .MuiPaper-root": { p: 0 } }}
      >
        <MenuItem disabled sx={{ opacity: "1 !important" }}>
          <ListItemText primary="Signed in as" secondary={email} />
        </MenuItem>
        <Divider sx={{ my: "4px !important" }} />
        <MenuItem onClick={signOut} disabled={signingOut}>
          <ListItemText>{signingOut ? "Signing out…" : "Sign out"}</ListItemText>
          <ListItemIcon sx={{ ml: "auto", minWidth: "0 !important" }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
        </MenuItem>
      </Menu>
    </Stack>
  );
}

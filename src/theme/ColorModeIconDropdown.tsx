"use client";

// Adapted from the MUI Dashboard template (MIT), mui/material-ui v9.5.0
// docs/data/material/getting-started/templates. Keep in sync by hand.
// App change: a fourth choice, Glass (A29) - the dark scheme with the glass
// skin on; the other choices turn the skin off.

import * as React from 'react';
import DarkModeIcon from '@mui/icons-material/DarkModeRounded';
import LightModeIcon from '@mui/icons-material/LightModeRounded';
import GlassIcon from '@mui/icons-material/BlurOnRounded';
import Box from '@mui/material/Box';
import IconButton, { IconButtonOwnProps } from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useColorScheme } from '@mui/material/styles';
import { isGlassSkin, setGlassSkin, subscribeGlassSkin } from './skin';

type Choice = 'system' | 'light' | 'dark' | 'glass';

export default function ColorModeIconDropdown(props: IconButtonOwnProps) {
  const { mode, systemMode, setMode, setColorScheme } = useColorScheme();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const glassOn = React.useSyncExternalStore(subscribeGlassSkin, isGlassSkin, () => false);
  const handleMode = (choice: Choice) => () => {
    setGlassSkin(choice === 'glass');
    // Back to the built-in light/dark schemes, in case an old one was saved.
    setColorScheme(null);
    setMode(choice === 'glass' ? 'dark' : choice);
    handleClose();
  };
  const selected: Choice | undefined = glassOn && mode === 'dark' ? 'glass' : mode;
  if (!mode) {
    return (
      <Box
        data-screenshot="toggle-mode"
        sx={(theme) => ({
          verticalAlign: 'bottom',
          display: 'inline-flex',
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: (theme.vars || theme).shape.borderRadius,
          border: '1px solid',
          borderColor: (theme.vars || theme).palette.divider,
        })}
      />
    );
  }
  const resolvedMode = (systemMode || mode) as 'light' | 'dark';
  const icon =
    selected === 'glass' ? <GlassIcon /> : { light: <LightModeIcon />, dark: <DarkModeIcon /> }[resolvedMode];
  return (
    <React.Fragment>
      <IconButton
        data-screenshot="toggle-mode"
        onClick={handleClick}
        disableRipple
        size="small"
        aria-controls={open ? 'color-scheme-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        {...props}
      >
        {icon}
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        slotProps={{
          paper: {
            variant: 'outlined',
            elevation: 0,
            sx: {
              my: '4px',
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem selected={selected === 'system'} onClick={handleMode('system')}>
          System
        </MenuItem>
        <MenuItem selected={selected === 'light'} onClick={handleMode('light')}>
          Light
        </MenuItem>
        <MenuItem selected={selected === 'dark'} onClick={handleMode('dark')}>
          Dark
        </MenuItem>
        <MenuItem selected={selected === 'glass'} onClick={handleMode('glass')}>
          Glass
        </MenuItem>
      </Menu>
    </React.Fragment>
  );
}

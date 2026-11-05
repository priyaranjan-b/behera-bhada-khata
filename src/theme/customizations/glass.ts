// The Glass skin (A29): overrides that apply only under GLASS_ROOT (the dark
// scheme + data-app-skin="glass"). Kept in one file, merged last in
// theme/index.ts, so Light and Dark never see them. Its selectors outrank the
// template's `*:where([data-mui-color-scheme="dark"])` rules, so order
// within a component doesn't matter.
import type { Components, CSSObject, Theme } from "@mui/material/styles";
import { buttonClasses } from "@mui/material/Button";
import { chipClasses } from "@mui/material/Chip";
import { outlinedInputClasses } from "@mui/material/OutlinedInput";
import { switchClasses } from "@mui/material/Switch";
import { glass } from "../appTokens";
import { GLASS_ROOT, glassPane, glassPopup, glassSkin } from "../skin";

/** "#D4F53C" → "212 245 60", the form MUI's `*Channel` variables take. */
function channel(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Redefines a palette colour's CSS variables (and their channels). */
function paletteVars(name: string, c: { main: string; light: string; dark: string; contrastText: string }) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(c)) {
    out[`--template-palette-${name}-${key}`] = value;
    out[`--template-palette-${name}-${key}Channel`] = channel(value);
  }
  return out;
}

const neonFocus = { outline: `3px solid color-mix(in srgb, ${glass.lime} 45%, transparent)`, borderColor: glass.lime };

/** A status chip in a neon colour: tinted glass, the label in the colour. */
const neonChip = (c: string): CSSObject => ({
  borderColor: `color-mix(in srgb, ${c} 32%, transparent)`,
  backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)`,
  [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: c },
});

const popupIn = (paperClass: string) => ({
  props: {},
  style: glassSkin({ [`& .${paperClass}`]: glassPopup }),
});

export const glassCustomizations: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      [GLASS_ROOT]: {
        // The palette, redefined for everything that reads the variables
        // (links, focus rings, charts' primary, badges, text).
        "--template-palette-background-default": glass.base,
        "--template-palette-background-defaultChannel": channel(glass.base),
        "--template-palette-background-paper": glass.pane,
        "--template-palette-divider": glass.divider,
        "--template-palette-text-secondary": glass.textSecondary,
        ...paletteVars("primary", { main: glass.lime, light: glass.limeLight, dark: glass.limeDark, contrastText: glass.onNeon }),
        ...paletteVars("info", { main: glass.cyan, light: glass.cyan, dark: glass.cyan, contrastText: glass.onNeon }),
        ...paletteVars("warning", { main: glass.amber, light: glass.amber, dark: glass.amber, contrastText: glass.onNeon }),
      },
      // The canvas: a fixed layer under the page (not background-attachment,
      // which phones ignore).
      [`${GLASS_ROOT} body::before`]: {
        content: '""',
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: glass.canvas,
      },
    } as CSSObject,
  },

  // Surfaces: raised cards are the frosted panes; plain cards (nested
  // panels) a lighter layer without a blur of their own.
  MuiCard: {
    variants: [
      {
        props: {},
        style: glassSkin({
          backgroundColor: glass.inset,
          backgroundImage: "none",
          borderColor: glass.rim,
          borderRadius: glass.radius * 0.75,
        }),
      },
      {
        props: { variant: "raised" },
        style: glassSkin({
          ...glassPane,
          borderRadius: glass.radius,
          "&[data-interactive]": {
            "@media (hover: hover)": {
              "&:hover": { backgroundColor: glass.paneHover, borderColor: glass.rimHover, boxShadow: glass.shadow },
            },
            "&:active": { boxShadow: glass.shadow },
          },
        }),
      },
    ],
  },
  MuiAccordion: {
    variants: [{ props: {}, style: glassSkin({ backgroundColor: glass.inset, borderColor: glass.rim }) }],
  },

  // Pop-ups: darker, near-opaque glass.
  MuiPopover: { variants: [popupIn("MuiPopover-paper")] },
  MuiDialog: { variants: [popupIn("MuiDialog-paper")] },
  MuiDrawer: { variants: [popupIn("MuiDrawer-paper")] },
  // No variants on the picker popper; `root` is a free slot (the template styles `paper`).
  MuiPickerPopper: { styleOverrides: { root: glassSkin({ "& .MuiPickerPopper-paper": glassPopup }) } },
  MuiAutocomplete: { styleOverrides: { paper: glassSkin(glassPopup) } },

  // Buttons: primary is a neon pill with dark text; outlined a glass pill.
  MuiButton: {
    variants: [
      {
        props: { variant: "contained", color: "primary" },
        style: glassSkin({
          color: glass.onNeon,
          backgroundColor: glass.lime,
          backgroundImage: "none",
          border: `1px solid ${glass.lime}`,
          boxShadow: "none",
          "&:hover": { backgroundColor: glass.limeLight, backgroundImage: "none", boxShadow: "none" },
          "&:active": { backgroundColor: glass.limeDark },
          [`&.${buttonClasses.disabled}`]: { color: glass.textSecondary, backgroundColor: glass.inset, borderColor: glass.rim },
        }),
      },
      {
        props: { variant: "outlined" },
        style: glassSkin({
          backgroundColor: glass.inset,
          borderColor: glass.rim,
          "&:hover": { backgroundColor: glass.paneHover, borderColor: glass.rimHover },
          "&:active": { backgroundColor: glass.pane },
        }),
      },
    ],
  },

  // Fields: a faint inset with a rim; the floated label masks the border
  // with a solid colour close to a pane over the canvas.
  MuiOutlinedInput: {
    variants: [
      {
        props: {},
        style: glassSkin({
          backgroundColor: glass.inset,
          borderColor: glass.rim,
          "&:hover": { borderColor: glass.rimHover },
          [`&.${outlinedInputClasses.focused}`]: neonFocus,
        }),
      },
    ],
  },
  MuiInputLabel: {
    variants: [
      {
        props: { variant: "outlined" },
        style: glassSkin({ "&.MuiInputLabel-shrink": { backgroundColor: glass.labelMask } }),
      },
    ],
  },

  MuiChip: {
    variants: [
      { props: { color: "info" }, style: glassSkin(neonChip(glass.cyan)) },
      { props: { color: "primary" }, style: glassSkin(neonChip(glass.lime)) },
      { props: { color: "warning" }, style: glassSkin(neonChip(glass.amber)) },
      {
        props: { variant: "tag" },
        style: glassSkin({
          backgroundColor: glass.inset,
          borderColor: glass.rim,
          [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: "inherit" },
        }),
      },
    ],
  },

  MuiAvatar: {
    variants: [
      {
        props: { variant: "soft" },
        style: glassSkin({ backgroundColor: glass.inset, color: glass.lime, borderColor: glass.rim }),
      },
    ],
  },
  MuiSwitch: {
    variants: [
      {
        props: {},
        style: glassSkin({
          [`& .${switchClasses.switchBase}.${switchClasses.checked} + .${switchClasses.track}`]: {
            backgroundColor: glass.lime,
            borderColor: glass.lime,
            boxShadow: "none",
          },
          [`& .${switchClasses.thumb}::before`]: { backgroundColor: glass.limeDark },
        }),
      },
    ],
  },
};

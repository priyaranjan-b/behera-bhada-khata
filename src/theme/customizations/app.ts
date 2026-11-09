// App-specific additions on top of the MUI Dashboard template customizations.
// Kept separate from the copied template files so those stay easy to re-sync;
// index.ts merges these per component (variants are appended, not replaced).
import { alpha, type Components, type Theme } from "@mui/material/styles";
import { alertClasses } from "@mui/material/Alert";
import { autocompleteClasses } from "@mui/material/Autocomplete";
import { bottomNavigationActionClasses } from "@mui/material/BottomNavigationAction";
import { chipClasses } from "@mui/material/Chip";
import { iconButtonClasses } from "@mui/material/IconButton";
import { switchClasses } from "@mui/material/Switch";
import type {} from "@mui/x-date-pickers/themeAugmentation";
import { pickersInputBaseClasses } from "@mui/x-date-pickers/PickersTextField";
import { brand, gray, orange, red } from "../themePrimitives";
import { cardShadows, lightSurfaces, slate } from "../appTokens";
import { embeddedIconButton } from "../embeddedIconButton";

declare module "@mui/material/Chip" {
  interface ChipPropsVariantOverrides {
    /** Neutral, squarer label for categories (property, unit type…). */
    tag: true;
  }
}
// Card takes its `variant` union from Paper.
declare module "@mui/material/Paper" {
  interface PaperPropsVariantOverrides {
    /** Bordered card with a layered "3D" shadow; render it via `<AppCard>`. */
    raised: true;
  }
}
declare module "@mui/material/Avatar" {
  interface AvatarPropsVariantOverrides {
    /** Indigo-tinted initials avatar used for tenants. */
    soft: true;
  }
}

/** A Material icon path as a CSS mask image (the switch thumb's ✕ / ✓). */
const iconMask = (path: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${path}'/></svg>")`;
// CloseRounded and CheckRounded from @mui/icons-material.
const SWITCH_CLOSE = iconMask(
  "M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7a.996.996 0 0 0-1.41 0c-.39.39-.39 1.02 0 1.41L10.59 12 5.7 16.89c-.39.39-.39 1.02 0 1.41s1.02.39 1.41 0L12 13.41l4.89 4.89c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4",
);
const SWITCH_CHECK = iconMask(
  "M9 16.17 5.53 12.7a.996.996 0 0 0-1.41 0c-.39.39-.39 1.02 0 1.41l4.18 4.18c.39.39 1.02.39 1.41 0L20.29 7.71c.39-.39.39-1.02 0-1.41a.996.996 0 0 0-1.41 0z",
);

// WCAG 2.5.5-ish: comfortable tap targets on touch devices only.
const coarsePointerTarget = { "@media (pointer: coarse)": { minHeight: 44 } };

export const appCustomizations: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      // A rent ledger is mostly figures: keep digits aligned everywhere.
      body: { WebkitFontSmoothing: "antialiased", fontVariantNumeric: "tabular-nums" },
      "@media (prefers-reduced-motion: reduce)": {
        "*, *::before, *::after": {
          animationDuration: "0.01ms !important",
          transitionDuration: "0.01ms !important",
        },
      },
    },
  },
  MuiChip: {
    variants: [
      // The template themes default/success/error chips; warning and info follow
      // the same light-fill / dark-fill recipe. Text clears WCAG AA in both
      // schemes (orange[600], not [500], which is only 3.5:1 on orange[50]).
      {
        props: { color: "warning" },
        style: ({ theme }) => ({
          borderColor: orange[200],
          backgroundColor: orange[50],
          [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: orange[600] },
          ...theme.applyStyles("dark", {
            borderColor: orange[800],
            backgroundColor: orange[900],
            [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: orange[300] },
          }),
        }),
      },
      {
        props: { color: "info" },
        style: ({ theme }) => ({
          borderColor: brand[200],
          backgroundColor: brand[50],
          [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: brand[700] },
          ...theme.applyStyles("dark", {
            borderColor: brand[800],
            backgroundColor: brand[900],
            [`& .${chipClasses.label}, & .${chipClasses.icon}`]: { color: brand[200] },
          }),
        }),
      },
      {
        props: { variant: "tag" },
        style: ({ theme }) => ({
          maxWidth: "100%",
          borderRadius: 6,
          borderColor: "transparent",
          backgroundColor: gray[100],
          [`& .${chipClasses.label}`]: { color: gray[600], fontWeight: 500 },
          ...theme.applyStyles("dark", {
            backgroundColor: gray[800],
            [`& .${chipClasses.label}`]: { color: gray[300] },
          }),
        }),
      },
    ],
  },
  MuiAvatar: {
    variants: [
      {
        props: { variant: "soft" },
        style: ({ theme }) => ({
          borderRadius: "50%",
          fontWeight: 600,
          backgroundColor: brand[50],
          color: brand[700],
          border: `1px solid ${brand[100]}`,
          ...theme.applyStyles("dark", {
            backgroundColor: brand[900],
            color: brand[200],
            borderColor: brand[800],
          }),
        }),
      },
    ],
  },
  // Light-scheme surface layering (appTokens.lightSurfaces): the canvas is now
  // slate, so things that sat on `background.default` in the template need
  // to be white explicitly to stay surfaces on top of it.
  MuiCard: {
    variants: [
      {
        props: {},
        style: ({ theme }) => theme.applyStyles("light", { backgroundColor: lightSurfaces.paper }),
      },
      {
        props: { variant: "raised" },
        style: ({ theme }) => ({
          border: `1px solid ${(theme.vars || theme).palette.divider}`,
          background: alpha(gray[900], 0.55),
          boxShadow: cardShadows.dark.rest,
          transition: theme.transitions.create(["box-shadow", "transform", "border-color"], { duration: 200 }),
          // <AppCard interactive | href>: a link card. Lift only where hover
          // exists (no sticky hover on touch); keyboard focus gets a ring.
          "&[data-interactive]": {
            // Also a link (<AppCard href>): an <a> is inline by default.
            display: "block",
            cursor: "pointer",
            color: "inherit",
            textDecoration: "none",
            "@media (hover: hover)": {
              "&:hover": { transform: "translateY(-2px)", boxShadow: cardShadows.dark.hover },
            },
            "&:focus-visible": {
              outline: `2px solid ${(theme.vars || theme).palette.primary.main}`,
              outlineOffset: 2,
            },
            "&:active": { transform: "translateY(0)", boxShadow: cardShadows.dark.rest },
          },
          ...theme.applyStyles("light", {
            background: lightSurfaces.paper,
            borderColor: lightSurfaces.border,
            boxShadow: cardShadows.light.rest,
            "&[data-interactive]": {
              "@media (hover: hover)": {
                "&:hover": { boxShadow: cardShadows.light.hover, borderColor: slate[400] },
              },
              "&:active": { boxShadow: cardShadows.light.rest },
            },
          }),
        }),
      },
    ],
  },
  MuiOutlinedInput: {
    variants: [
      {
        props: {},
        style: ({ theme }) => theme.applyStyles("light", { backgroundColor: lightSurfaces.paper }),
      },
    ],
  },
  // The template draws the field border on OutlinedInput's root and hides
  // the notched outline (inputs.tsx), so a floating `TextField label` gets no
  // gap cut in the border and the line strikes through the text. Instead the
  // floated label carries the field's own background (same rule as
  // MuiOutlinedInput above: paper in light, background.default in dark),
  // masking the border behind it. The resting position is retuned for the
  // template's 2.5rem / 2.25rem fields (MUI's default assumes 56px / 40px).
  MuiInputLabel: {
    variants: [
      {
        props: { variant: "outlined" },
        style: ({ theme }) => ({
          transform: "translate(13px, 9px) scale(1)",
          "&.MuiInputLabel-sizeSmall": { transform: "translate(13px, 7px) scale(1)" },
          "&.MuiInputLabel-shrink": {
            transform: "translate(10px, -9px) scale(0.75)",
            padding: "0 4px",
            borderRadius: 2,
            backgroundColor: (theme.vars || theme).palette.background.default,
            ...theme.applyStyles("light", { backgroundColor: lightSurfaces.paper }),
          },
        }),
      },
    ],
  },
  MuiButton: {
    variants: [
      { props: {}, style: coarsePointerTarget },
      // The template's outlined style greys every colour but secondary; a
      // destructive action (Move out) must read as one before it's tapped.
      {
        props: { variant: "outlined", color: "error" },
        style: ({ theme }) => ({
          color: red[400],
          borderColor: red[200],
          backgroundColor: red[50],
          "&:hover": { borderColor: red[300], backgroundColor: red[100] },
          "&:active": { backgroundColor: alpha(red[200], 0.7) },
          ...theme.applyStyles("dark", {
            color: red[300],
            borderColor: red[700],
            backgroundColor: alpha(red[900], 0.4),
            "&:hover": { borderColor: red[500], backgroundColor: alpha(red[800], 0.6) },
            "&:active": { backgroundColor: alpha(red[800], 0.8) },
          }),
        }),
      },
    ],
  },
  MuiAlert: {
    variants: [
      // An alert with an action button (Start tracking rent): the button keeps
      // its label on one line, and on phones it drops below the message,
      // lined up with the text, instead of squeezing it into a sliver.
      {
        props: {},
        style: ({ theme }) => ({
          [`& .${alertClasses.action}`]: {
            flexShrink: 0,
            alignItems: "center",
            "& .MuiButton-root": { whiteSpace: "nowrap" },
          },
          [theme.breakpoints.down("sm")]: {
            flexWrap: "wrap",
            [`& .${alertClasses.message}`]: { flex: "1 1 0", minWidth: 0 },
            [`& .${alertClasses.action}`]: {
              flexBasis: "100%",
              justifyContent: "flex-start",
              margin: 0,
              // Icon (22px) + its gap (12px): starts under the message text.
              padding: theme.spacing(0, 0, 1, "34px"),
            },
          },
        }),
      },
    ],
  },
  // A date or month field (MUI X pickers) draws its own input, not
  // OutlinedInput, so the template's fixed field heights (2.5rem, 2.25rem
  // small; inputs.tsx) missed it and it stood 56px tall beside 40px fields.
  // Same height and side padding as every other field.
  MuiPickersOutlinedInput: {
    styleOverrides: {
      root: {
        height: "2.5rem",
        padding: "0 12px",
        [`&.${pickersInputBaseClasses.inputSizeSmall}`]: { height: "2.25rem" },
        [`& .${pickersInputBaseClasses.sectionsContainer}`]: { padding: 0 },
      },
    },
  },
  MuiToggleButton: { variants: [{ props: {}, style: coarsePointerTarget }] },
  // iOS-style switch: a pill track with a white thumb that slides across,
  // filled with the brand colour when on. Replaces Material's thin track with
  // an overhanging thumb. Medium 44×26, small 36×22. The thumb carries a ✕
  // (off) or ✓ (on), drawn as a CSS mask so no call site passes icons, and
  // the track glows softly when on.
  MuiSwitch: {
    styleOverrides: {
      root: ({ theme }) => ({
        width: 44,
        height: 26,
        padding: 0,
        overflow: "visible",
        [`&.${switchClasses.sizeSmall}`]: {
          width: 36,
          height: 22,
          [`& .${switchClasses.thumb}`]: { width: 18, height: 18, "&::before": { inset: 3 } },
          [`& .${switchClasses.switchBase}.${switchClasses.checked}`]: { transform: "translateX(14px)" },
        },
        [`& .${switchClasses.switchBase}`]: {
          padding: 0,
          margin: 2,
          transitionDuration: "200ms",
          "&:hover": { backgroundColor: "transparent" },
          [`&.${switchClasses.checked}`]: {
            transform: "translateX(18px)",
            color: (theme.vars || theme).palette.common.white,
            [`& + .${switchClasses.track}`]: {
              opacity: 1,
              backgroundColor: brand[500],
              border: 0,
              boxShadow: `0 0 0 4px ${alpha(brand[400], 0.22)}`,
            },
            [`& .${switchClasses.thumb}::before`]: { maskImage: SWITCH_CHECK, WebkitMaskImage: SWITCH_CHECK, backgroundColor: brand[600] },
          },
          [`&.${switchClasses.disabled} + .${switchClasses.track}`]: { opacity: 0.5 },
          [`&.${switchClasses.disabled} .${switchClasses.thumb}`]: { opacity: 0.8 },
          // Keyboard focus: a ring around the whole pill.
          [`&.Mui-focusVisible + .${switchClasses.track}`]: {
            outline: `2px solid ${brand[400]}`,
            outlineOffset: 2,
          },
        },
        [`& .${switchClasses.thumb}`]: {
          width: 22,
          height: 22,
          boxShadow: `0 1px 3px ${alpha(gray[900], 0.3)}, 0 1px 1px ${alpha(gray[900], 0.08)}`,
          backgroundColor: (theme.vars || theme).palette.common.white,
          position: "relative",
          // The ✕ / ✓ on the thumb, in the icon's colour.
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 4,
            backgroundColor: gray[400],
            maskImage: SWITCH_CLOSE,
            WebkitMaskImage: SWITCH_CLOSE,
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            transition: theme.transitions.create("background-color", { duration: 200 }),
          },
        },
        [`& .${switchClasses.track}`]: {
          borderRadius: 999,
          opacity: 1,
          backgroundColor: gray[300],
          transition: theme.transitions.create(["background-color", "box-shadow"], { duration: 200 }),
          ...theme.applyStyles("dark", { backgroundColor: gray[700] }),
        },
      }),
    },
  },
  // A label beside the switch above: the stock -11px offsets assume
  // Material's padded switch, so drop them and space it with a gap instead.
  MuiFormControlLabel: {
    styleOverrides: {
      root: {
        [`&:has(.${switchClasses.root})`]: { marginLeft: 0, marginRight: 0, gap: 10 },
      },
    },
  },
  // The 44px touch size is for standalone icon buttons (header bar, row actions).
  MuiIconButton: {
    variants: [{ props: {}, style: { "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 } } }],
  },
  // An icon button inside a field (a date or month picker's calendar, a
  // search field's clear/close, a password toggle) is a plain icon that fits
  // the 36-40px field: no border or fill, and not the 44px standalone size,
  // which on phones overflowed the field.
  MuiInputAdornment: {
    variants: [
      {
        props: {},
        style: ({ theme }) => ({ [`& .${iconButtonClasses.root}`]: embeddedIconButton(theme, 32, 36) }),
      },
    ],
  },
  // An Autocomplete's clear × and dropdown arrow (Tags, Note, Search) sit in
  // its own end slot, not an InputAdornment: the same plain icon, at the
  // 28px its slot is centred for.
  // The tenant portal's section bar on phones (PageTabs phoneNav="bottom", A32):
  // grey until chosen, the open section in the brand colour with a bolder
  // label, every label always shown, and a full-height tap target.
  MuiBottomNavigationAction: {
    styleOverrides: {
      root: ({ theme }) => ({
        minWidth: 0,
        minHeight: 56,
        color: (theme.vars || theme).palette.text.secondary,
        [`&.${bottomNavigationActionClasses.selected}`]: { color: (theme.vars || theme).palette.primary.main },
      }),
      label: {
        fontSize: "0.75rem",
        [`&.${bottomNavigationActionClasses.selected}`]: { fontSize: "0.75rem", fontWeight: 600 },
      },
    },
  },
  MuiAutocomplete: {
    variants: [
      {
        props: {},
        style: ({ theme }) => ({
          [`& .${autocompleteClasses.endAdornment} .${iconButtonClasses.root}`]: embeddedIconButton(theme, 28),
        }),
      },
    ],
  },
};

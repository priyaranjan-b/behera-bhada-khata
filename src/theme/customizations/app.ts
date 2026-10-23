// App-specific additions on top of the MUI Dashboard template customizations.
// Kept separate from the copied template files so those stay easy to re-sync;
// index.ts merges these per component (variants are appended, not replaced).
import type { Components, Theme } from "@mui/material/styles";
import { chipClasses } from "@mui/material/Chip";
import { brand, gray, orange } from "../themePrimitives";
import { lightSurfaces } from "../appTokens";

declare module "@mui/material/Chip" {
  interface ChipPropsVariantOverrides {
    /** Neutral, squarer label for categories (property, unit type…). */
    tag: true;
  }
}
declare module "@mui/material/Avatar" {
  interface AvatarPropsVariantOverrides {
    /** Indigo-tinted initials avatar used for tenants. */
    soft: true;
  }
}

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
  // the notched outline (inputs.tsx), so a floating `TextField label` has no
  // gap cut for it and the border strikes through the text. Show outlined
  // labels the template's way instead: static, above the field, like
  // FormLabel.
  MuiInputLabel: {
    variants: [
      {
        props: { variant: "outlined" },
        style: ({ theme }) => ({
          ...theme.typography.caption,
          position: "static",
          transform: "none",
          maxWidth: "100%",
          marginBottom: 6,
          color: (theme.vars || theme).palette.text.secondary,
          pointerEvents: "auto",
          "&.Mui-focused": { color: (theme.vars || theme).palette.primary.main },
          "&.Mui-error": { color: (theme.vars || theme).palette.error.main },
          "&.Mui-disabled": { color: (theme.vars || theme).palette.text.disabled },
        }),
      },
    ],
  },
  MuiButton: { variants: [{ props: {}, style: coarsePointerTarget }] },
  MuiToggleButton: { variants: [{ props: {}, style: coarsePointerTarget }] },
  MuiIconButton: {
    variants: [{ props: {}, style: { "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 } } }],
  },
};

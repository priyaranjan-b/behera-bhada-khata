// App-specific additions on top of the MUI Dashboard template customizations.
// Kept separate from the copied template files so those stay easy to re-sync;
// index.ts merges these per component (variants are appended, not replaced).
import { alpha, type Components, type Theme } from "@mui/material/styles";
import { chipClasses } from "@mui/material/Chip";
import { brand, gray, orange } from "../themePrimitives";
import { cardShadows, lightSurfaces, slate } from "../appTokens";

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
  MuiButton: { variants: [{ props: {}, style: coarsePointerTarget }] },
  MuiToggleButton: { variants: [{ props: {}, style: coarsePointerTarget }] },
  MuiIconButton: {
    variants: [{ props: {}, style: { "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 } } }],
  },
};

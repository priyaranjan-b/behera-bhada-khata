import type { Theme } from "@mui/material/styles";
import { brand } from "@/theme/themePrimitives";
import { lightSurfaces } from "@/theme/appTokens";

// The desktop side menu is a dark contrast column, like CoreUI's admin
// layout, in both colour schemes - CoreUI's dark slate nudged towards the
// brand indigo. Inside it the theme's text, divider and hover variables are
// redefined, so everything in it (links, icons, the brand name, the owner
// card) switches to light-on-dark without per-component overrides. Pop-ups
// (the owner menu) render outside it and keep the normal palette.

/** The side menu column. */
export const SIDE_MENU_BG = `color-mix(in srgb, ${brand[900]} 22%, #212631)`;
/** The logo band at its top: a shade darker (CoreUI's rgba(0, 0, 21, 0.2) overlay, as one solid colour). */
const BRAND_BAND_BG = `color-mix(in srgb, #000015 20%, ${SIDE_MENU_BG})`;

/** Light-on-dark palette for anything placed on the side menu. */
const onChromeSx = {
  color: "rgba(255, 255, 255, 0.87)",
  "--template-palette-text-primary": "rgba(255, 255, 255, 0.92)",
  "--template-palette-text-secondary": "rgba(255, 255, 255, 0.6)",
  "--template-palette-divider": "rgba(255, 255, 255, 0.08)",
  "--template-palette-action-hover": "rgba(255, 255, 255, 0.05)",
  // The template's bordered icon buttons (the owner card ⋮) as quiet ghosts.
  "& .MuiIconButton-root": {
    color: "rgba(255, 255, 255, 0.7)",
    backgroundColor: "transparent",
    borderColor: "transparent",
    "&:hover": { color: "#FFFFFF", backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "transparent" },
  },
} as const;

/** Desktop side menu: the dark contrast column. */
export const sideMenuSurfaceSx = (_theme: Theme) => ({
  ...onChromeSx,
  backgroundColor: SIDE_MENU_BG,
  backgroundImage: "none",
});

/** The band behind the logo at the top of the side menu. */
export const sideMenuBrandBandSx = { backgroundColor: BRAND_BAND_BG } as const;

// The top bars stay light: a faint indigo tint over the paper colour, between
// the slate canvas and the white cards.

/** The top bar tint: a whisper of brand over the paper colour. */
function chromeTint(theme: Theme, alpha = 100) {
  const paper = (theme.vars || theme).palette.background.paper;
  return {
    dark: `color-mix(in srgb, color-mix(in srgb, ${brand[800]} 32%, ${paper}) ${alpha}%, transparent)`,
    light: `color-mix(in srgb, color-mix(in srgb, ${brand[50]} 62%, ${lightSurfaces.paper}) ${alpha}%, transparent)`,
  };
}

/** Phone/tablet top bar: the light tint, solid. */
export const shellSurfaceSx = (theme: Theme) => {
  const tint = chromeTint(theme);
  return {
    backgroundColor: tint.dark,
    backgroundImage: "none",
    ...theme.applyStyles("light", { backgroundColor: tint.light }),
  };
};

/**
 * Desktop top bar: frosted glass in the light tint, so content scrolling
 * under it blurs instead of colliding with it; `raised` (scrolled) adds a
 * soft shadow that separates it from the page.
 */
export const topBarGlassSx = (theme: Theme, raised: boolean) => {
  const tint = chromeTint(theme, 78);
  return {
    backgroundColor: tint.dark,
    backgroundImage: "none",
    backdropFilter: "saturate(180%) blur(12px)",
    WebkitBackdropFilter: "saturate(180%) blur(12px)",
    transition: theme.transitions.create("box-shadow", { duration: theme.transitions.duration.short }),
    boxShadow: raised ? "0 10px 28px -14px rgba(0, 0, 0, 0.7)" : "none",
    ...theme.applyStyles("light", {
      backgroundColor: tint.light,
      boxShadow: raised ? "0 1px 0 rgba(15, 23, 42, 0.04), 0 10px 28px -14px rgba(30, 27, 75, 0.22)" : "none",
    }),
  };
};

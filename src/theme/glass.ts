// The glass colour scheme (A29): a third named scheme next to light and dark.
// It is a *light* scheme (palette.mode "light"), switched by
// `data-mui-color-scheme="glass"`, so `applyStyles("light", …)` doesn't reach
// it. Styles meant for every light surface go through `lightStyles`, which
// emits the same rules for glass, plus optional glass-only tweaks merged on top.
import type { CSSObject, Theme } from "@mui/material/styles";
import deepmerge from "@mui/utils/deepmerge";
import { glassSurfaces } from "./appTokens";

declare module "@mui/material/styles" {
  interface ColorSchemeOverrides {
    glass: true;
  }
}

export const GLASS_SCHEME = "glass";

/**
 * `styles` in the light and glass schemes, with `glass` merged over them for
 * the glass scheme only. Use it instead of `theme.applyStyles("light", …)`,
 * and instead of a separate `applyStyles("glass", …)` in the same object
 * (both would write the same selector key, and the later one would win).
 */
export function lightStyles(theme: Theme, styles: CSSObject, glass?: CSSObject): CSSObject {
  return {
    ...theme.applyStyles("light", styles),
    ...theme.applyStyles(GLASS_SCHEME, glass ? deepmerge(styles, glass) : styles),
  } as CSSObject;
}

/** A frosted pane's blur, both spellings (Safari still wants the prefix). */
export const glassBlur = {
  backdropFilter: glassSurfaces.blur,
  WebkitBackdropFilter: glassSurfaces.blur,
} as const;

/** Menus, dialogs, drawers and picker pop-ups in the glass scheme. */
export function glassPopupSx(theme: Theme): CSSObject {
  return theme.applyStyles(GLASS_SCHEME, {
    ...glassBlur,
    backgroundColor: glassSurfaces.popup,
    backgroundImage: "none",
    border: `1px solid ${glassSurfaces.rim}`,
    boxShadow: glassSurfaces.shadow.hover,
  }) as CSSObject;
}

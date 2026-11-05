// The Glass skin (A29): the dark colour scheme plus `data-app-skin="glass"`
// on <html>. It is not a separate MUI colour scheme, so every
// `applyStyles("dark", …)` rule still applies and glass only restyles what
// differs. Its rules hang off GLASS_ROOT, which also requires the dark
// scheme, so a stale attribute can never paint glass over Light.
import type { CSSObject } from "@mui/material/styles";
import { glass } from "./appTokens";

export const SKIN_ATTRIBUTE = "data-app-skin";
export const SKIN_STORAGE_KEY = "app-skin";
const SKIN_EVENT = "app-skin-change";

/** <html> while the Glass skin is on. */
export const GLASS_ROOT = `html[${SKIN_ATTRIBUTE}="glass"][data-mui-color-scheme="dark"]`;

/**
 * `styles` only under the Glass skin, for component overrides and `sx`.
 * One per object: two would write the same selector key and the later wins.
 */
export function glassSkin(styles: CSSObject): CSSObject {
  return { [`${GLASS_ROOT} &`]: styles };
}

/** A pane's blur, both spellings (Safari still wants the prefix). */
export const glassBlur = {
  backdropFilter: glass.blur,
  WebkitBackdropFilter: glass.blur,
} as const;

/** A see-through pane: cards, bars, the side menu. */
export const glassPane = {
  ...glassBlur,
  backgroundColor: glass.pane,
  backgroundImage: "none",
  border: `1px solid ${glass.rim}`,
  boxShadow: glass.shadow,
} as const;

/** Menus, dialogs, drawers and picker pop-ups. */
export const glassPopup = {
  ...glassBlur,
  backgroundColor: glass.popup,
  backgroundImage: "none",
  border: `1px solid ${glass.rim}`,
  boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.85)",
} as const;

export function isGlassSkin(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute(SKIN_ATTRIBUTE) === "glass";
}

/** Turns the skin on or off and remembers it (the colour mode is set separately). */
export function setGlassSkin(on: boolean) {
  const root = document.documentElement;
  if (on) root.setAttribute(SKIN_ATTRIBUTE, "glass");
  else root.removeAttribute(SKIN_ATTRIBUTE);
  try {
    if (on) localStorage.setItem(SKIN_STORAGE_KEY, "glass");
    else localStorage.removeItem(SKIN_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): the skin lasts until reload.
  }
  window.dispatchEvent(new Event(SKIN_EVENT));
}

export function subscribeGlassSkin(onChange: () => void) {
  window.addEventListener(SKIN_EVENT, onChange);
  return () => window.removeEventListener(SKIN_EVENT, onChange);
}

/**
 * Runs before paint (InitSkinScript), next to MUI's InitColorSchemeScript,
 * so a reload in Glass doesn't flash the plain dark scheme.
 */
export const INIT_SKIN_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SKIN_STORAGE_KEY)})==="glass"){document.documentElement.setAttribute(${JSON.stringify(SKIN_ATTRIBUTE)},"glass")}}catch(e){}})();`;

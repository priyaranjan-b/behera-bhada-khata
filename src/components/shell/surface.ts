import type { Theme } from "@mui/material/styles";

/**
 * Background for the app chrome (side menu, top bars): the paper surface —
 * crisp white in light mode, over the slate page canvas (appTokens.lightSurfaces);
 * the template's paper colour in dark mode.
 */
export const shellSurfaceSx = (theme: Theme) => ({
  backgroundColor: (theme.vars || theme).palette.background.paper,
  backgroundImage: "none",
});

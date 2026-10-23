import type {} from "@mui/x-charts/themeAugmentation";
import type {} from "@mui/x-data-grid/themeAugmentation";
import { createTheme, type Components, type Theme } from "@mui/material/styles";
import { colorSchemes, shadows, shape, typography } from "./themePrimitives";
import { inputsCustomizations } from "./customizations/inputs";
import { dataDisplayCustomizations } from "./customizations/dataDisplay";
import { feedbackCustomizations } from "./customizations/feedback";
import { navigationCustomizations } from "./customizations/navigation";
import { surfacesCustomizations } from "./customizations/surfaces";
import { chartsCustomizations } from "./customizations/charts";
import { dataGridCustomizations } from "./customizations/dataGrid";
import { appCustomizations } from "./customizations/app";
import { lightSurfaces } from "./appTokens";

type ComponentConfig = {
  defaultProps?: object;
  styleOverrides?: object;
  variants?: unknown[];
};

// Per-component merge so a later set can add defaultProps/styleOverrides slots
// and append `variants` without wiping what an earlier set defined.
function mergeComponents(...sets: Components<Theme>[]): Components<Theme> {
  const out: Record<string, ComponentConfig> = {};
  for (const set of sets) {
    for (const [name, config] of Object.entries(set as Record<string, ComponentConfig>)) {
      const prev = out[name];
      out[name] = prev
        ? {
            ...prev,
            ...config,
            defaultProps: { ...prev.defaultProps, ...config.defaultProps },
            styleOverrides: { ...prev.styleOverrides, ...config.styleOverrides },
            variants: [...(prev.variants ?? []), ...(config.variants ?? [])],
          }
        : config;
    }
  }
  return out as Components<Theme>;
}

// Built once at module level (the template's AppTheme does this in a
// useMemo inside a client component). Light + dark live in `colorSchemes`
// and are switched by the `data-mui-color-scheme` attribute that
// InitColorSchemeScript sets in the root layout, so there's no flash.
//
// Because the active scheme is only known in the browser, components should
// use palette keys in `sx` ("primary.main", "divider") or `theme.vars.*`,
// never `theme.palette.X` values, which are always the light scheme's.
const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data-mui-color-scheme",
    cssVarPrefix: "template",
  },
  colorSchemes: {
    ...colorSchemes,
    // Light scheme gets distinct depth layers: slate canvas, white surfaces,
    // slate-200 hairlines (see appTokens.lightSurfaces). Dark stays template.
    light: {
      ...colorSchemes.light,
      palette: {
        ...colorSchemes.light.palette,
        divider: lightSurfaces.border,
        background: { default: lightSurfaces.canvas, paper: lightSurfaces.paper },
      },
    },
  },
  typography: {
    ...typography,
    // One weight for every card/section heading (template default is 500).
    subtitle2: { ...typography.subtitle2, fontWeight: 600 },
  },
  shadows,
  shape,
  components: mergeComponents(
    inputsCustomizations,
    dataDisplayCustomizations,
    feedbackCustomizations,
    navigationCustomizations,
    surfacesCustomizations,
    chartsCustomizations,
    dataGridCustomizations,
    appCustomizations
  ),
});

export default theme;

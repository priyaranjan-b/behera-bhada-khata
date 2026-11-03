import type { Theme } from "@mui/material/styles";

/**
 * An icon button that sits inside another control (a field's calendar or
 * clear ×, an Autocomplete's ×, a grid header's sort arrow): a plain icon
 * of `size` px, without the template's border and fill or the 44px
 * standalone touch size (app.ts), which made it outgrow its control on
 * phones. `touchSize` is its size on touch screens, if larger.
 */
export function embeddedIconButton(theme: Theme, size: number, touchSize?: number) {
  return {
    width: size,
    height: size,
    minWidth: 0,
    minHeight: 0,
    padding: 4,
    border: 0,
    backgroundColor: "transparent",
    color: (theme.vars || theme).palette.text.secondary,
    "&:hover, &:active": { backgroundColor: (theme.vars || theme).palette.action.hover },
    ...(touchSize ? { "@media (pointer: coarse)": { width: touchSize, height: touchSize } } : {}),
  };
}

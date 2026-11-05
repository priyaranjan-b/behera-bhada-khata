import type { Theme } from "@mui/material/styles";
import type { BadgeTone } from "./StatusBadge";

/** A status colour for kit surfaces: the badge tones plus the brand colour. */
export type Tone = BadgeTone | "primary";

const PALETTE_KEY = { success: "success", warning: "warning", danger: "error", info: "info", primary: "primary" } as const;

/** The tone's main and dark shades; neutral is the slate greys. */
function shades(theme: Theme, tone: Tone) {
  const palette = (theme.vars || theme).palette;
  if (tone === "neutral") return { main: palette.grey[400], dark: palette.grey[600], light: palette.text.secondary };
  return palette[PALETTE_KEY[tone]];
}

/**
 * Icon tile in a tone (stat cards), CSS variables via `theme.vars` and
 * `color-mix`, so nothing reads the palette in JS.
 * - Light: a clear wash of the tone with a hairline edge and the icon in its
 *   deep shade; the card's corner glow carries the rest of the colour.
 * - Dark: a soft tint behind a light icon, which already stands out on the
 *   dark card.
 */
export function toneTintSx(theme: Theme, tone: Tone) {
  const palette = (theme.vars || theme).palette;
  const c = shades(theme, tone);
  // The dark scheme's info is a deep indigo (brand 700) that vanishes on the
  // dark card; the brand primary is the same hue, light enough to read.
  const dark = tone === "info" ? palette.primary : c;
  return {
    color: dark.light,
    backgroundColor: `color-mix(in srgb, ${dark.main} 22%, transparent)`,
    ...theme.applyStyles("light", {
      // Between a pale tint (lost on white) and a solid fill (shouts): a
      // clear wash with a hairline edge, the icon in the deep shade.
      color: c.dark,
      backgroundColor: `color-mix(in srgb, ${c.main} 20%, transparent)`,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.main} 28%, transparent)`,
    }),
  };
}

/** The tone's main colour (accent bars, washes); neutral is the secondary text colour. */
export function toneMain(theme: Theme, tone: Tone): string {
  const palette = (theme.vars || theme).palette;
  return tone === "neutral" ? palette.text.secondary : palette[PALETTE_KEY[tone]].main;
}

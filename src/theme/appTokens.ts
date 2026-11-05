// App-level colour tokens layered on top of the template's palette
// (themePrimitives.ts stays close to upstream). Tailwind's slate ramp.
export const slate = {
  50: "#F8FAFC",
  100: "#F1F5F9",
  200: "#E2E8F0",
  400: "#94A3B8",
  500: "#64748B",
  600: "#475569",
  900: "#0F172A",
} as const;

/**
 * Light-scheme surface layers, from back to front:
 * canvas (workspace behind pages) → paper (cards, header, side menu) → row hover.
 */
export const lightSurfaces = {
  canvas: slate[100],
  paper: "#FFFFFF",
  border: slate[200],
  rowHover: slate[50],
} as const;

/**
 * The browser and phone chrome around the app (`theme-color`, the installed
 * app's splash screen): the header's paper colour per scheme, so the status
 * bar runs into the header. `dark` is the dark scheme's paper,
 * hsl(220, 30%, 7%) in themePrimitives.ts, as hex for older Android.
 */
export const appChrome = {
  light: lightSurfaces.paper,
  dark: "#0D1017",
  splash: lightSurfaces.canvas,
} as const;

/**
 * Layered card shadows for `<AppCard>` (Card `variant="raised"`): a tight
 * contact shadow plus a soft, wide ambient one, so cards read as lifted off
 * the canvas. Dark mode adds a faint top highlight since black shadows barely
 * show on a dark canvas.
 */
export const cardShadows = {
  light: {
    rest: "0 1px 2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.06), 0 10px 24px -8px rgba(15, 23, 42, 0.12)",
    hover: "0 2px 4px rgba(15, 23, 42, 0.06), 0 8px 16px -4px rgba(15, 23, 42, 0.10), 0 22px 40px -12px rgba(15, 23, 42, 0.22)",
  },
  dark: {
    rest: "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.45), 0 10px 24px -8px rgba(0, 0, 0, 0.6)",
    hover: "inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 2px 4px rgba(0, 0, 0, 0.5), 0 22px 40px -12px rgba(0, 0, 0, 0.75)",
  },
} as const;

/**
 * Categorical chart colours, one per tenant type in TENANT_KINDS order
 * (individual, business, government). Slots 1-3 of the dataviz reference
 * palette, checked with its validator against white and the dark paper:
 * the light aqua is under 3:1, so charts using these carry labels and a table view.
 */
export const chartCategorical = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
} as const;

/**
 * The Glass skin (A29): the dark scheme drawn as see-through smoked glass
 * over a black canvas with soft colour glows, neon accents. Panes stay faint
 * (6% white) and the glows dim, so white text keeps its contrast.
 */
export const glass = {
  /** Behind everything. */
  base: "#0B0B0D",
  /** A floated field label masks the border with this: a pane over the canvas, solid. */
  labelMask: "#17181B",
  /** The canvas: four soft glows, fixed behind every page. */
  canvas: [
    "radial-gradient(ellipse 55% 45% at 18% 8%, rgba(132, 160, 32, 0.42), transparent 70%)",
    "radial-gradient(ellipse 45% 40% at 42% 62%, rgba(26, 120, 130, 0.32), transparent 70%)",
    "radial-gradient(ellipse 45% 45% at 88% 92%, rgba(130, 52, 72, 0.40), transparent 70%)",
    "radial-gradient(ellipse 30% 35% at 100% 55%, rgba(170, 110, 30, 0.22), transparent 70%)",
  ].join(", "),
  /** A pane (card, bar, side menu). */
  pane: "rgba(255, 255, 255, 0.055)",
  paneHover: "rgba(255, 255, 255, 0.08)",
  /** A pane inside a pane (fields, grid header, nested panels). */
  inset: "rgba(255, 255, 255, 0.045)",
  /** Pop-ups (menus, dialogs, pickers) sit over busy content: darker, near-opaque. */
  popup: "rgba(24, 24, 27, 0.86)",
  /** Rows: a faint stripe and hover. */
  rowStripe: "rgba(255, 255, 255, 0.018)",
  rowHover: "rgba(255, 255, 255, 0.05)",
  /** A pane's edge, and the brighter one on hover. */
  rim: "rgba(255, 255, 255, 0.09)",
  rimHover: "rgba(255, 255, 255, 0.18)",
  divider: "rgba(255, 255, 255, 0.08)",
  textSecondary: "rgba(255, 255, 255, 0.62)",
  blur: "blur(28px) saturate(140%)",
  radius: 24,
  shadow: "inset 0 1px 0 rgba(255, 255, 255, 0.10), 0 20px 40px -24px rgba(0, 0, 0, 0.8)",
  /** Neon accents; text on them is `onNeon`. */
  lime: "#D4F53C",
  limeLight: "#E4FA7A",
  limeDark: "#AFCC1F",
  cyan: "#3CE6E6",
  amber: "#FFC23D",
  onNeon: "#111111",
} as const;

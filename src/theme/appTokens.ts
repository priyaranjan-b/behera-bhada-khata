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
 * The glass scheme (A29): a light scheme whose surfaces are frosted panes
 * over a colourful canvas. Cards stay ~70% white so figures keep their
 * contrast; blur is only on large containers (cards, bars, pop-ups).
 */
export const glassSurfaces = {
  /** Solid fallback behind the canvas, and the colour masks (labels, selected menu item) use. */
  base: "#ECEEFB",
  /** The canvas: soft colour blobs, fixed behind every page. */
  canvas: [
    "radial-gradient(at 8% 12%, rgba(124, 92, 255, 0.55) 0px, transparent 45%)",
    "radial-gradient(at 92% 8%, rgba(56, 189, 248, 0.5) 0px, transparent 45%)",
    "radial-gradient(at 85% 88%, rgba(244, 114, 182, 0.42) 0px, transparent 50%)",
    "radial-gradient(at 12% 92%, rgba(45, 212, 191, 0.42) 0px, transparent 50%)",
    "linear-gradient(135deg, #E9E7FF 0%, #E3F1FF 50%, #FBE9F5 100%)",
  ].join(", "),
  paper: "rgba(255, 255, 255, 0.7)",
  /** Pop-ups (menus, dialogs, pickers) sit over busy content: more opaque. */
  popup: "rgba(255, 255, 255, 0.86)",
  /** Field and grid header fills inside a pane. */
  inset: "rgba(255, 255, 255, 0.55)",
  rowHover: "rgba(255, 255, 255, 0.6)",
  rowStripe: "rgba(255, 255, 255, 0.22)",
  /** Lines inside a pane (white would vanish on white). */
  divider: "rgba(15, 23, 42, 0.09)",
  /** A pane's own edge: a bright rim catching the light. */
  rim: "rgba(255, 255, 255, 0.75)",
  rimHover: "rgba(255, 255, 255, 0.95)",
  blur: "blur(18px) saturate(160%)",
  shadow: {
    rest: "inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 32px -12px rgba(49, 46, 129, 0.22)",
    hover: "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 18px 44px -14px rgba(49, 46, 129, 0.32)",
  },
} as const;

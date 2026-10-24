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

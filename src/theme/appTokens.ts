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

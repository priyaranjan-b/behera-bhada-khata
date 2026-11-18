/**
 * Fixed app chrome (top bar, bottom bar, desktop header; A37): a long press
 * doesn't select its labels, and it holds still above a page transition under
 * its own `viewTransitionName` (the rules in `src/app/globals.css`).
 */
export function chromeSx(viewTransitionName: "app-header" | "app-top-bar" | "app-bottom-bar") {
  return { userSelect: "none", viewTransitionName } as const;
}

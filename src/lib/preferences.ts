import type { PaidDirectView } from "@/lib/types";

// "Include Govt paid direct" (A11) on Overview, Billing and Earnings is off on
// every visit. Switching it on adds `?paidDirect=show` to the page's URL, so
// Server Components compute the figures with it. Nothing is stored: the menu
// links between those three pages keep it (`carryPaidDirect`, A24), and
// opening any other page, or the app afresh, starts off again.

/** The URL param that switches government rent paid direct on. */
export const PAID_DIRECT_PARAM = "paidDirect";

/** The view from the URL param: shown only when it says "show". */
export function paidDirectViewOf(param: string | string[] | undefined): PaidDirectView {
  return param === "show" ? "show" : "hide";
}

/** Query to keep the view on links within the page (e.g. the next month): only when shown. */
export function paidDirectQuery(view: PaidDirectView): { paidDirect?: "show" } {
  return view === "show" ? { paidDirect: "show" } : {};
}

/**
 * A menu link to one of the report pages that honour the switch, keeping it
 * on when the page being viewed has it on (A24). `current` is the current
 * URL's `paidDirect` param; links to other pages pass `carries: false`.
 */
export function carryPaidDirect(href: string, carries: boolean, current: string | null): string {
  if (!carries || paidDirectViewOf(current ?? undefined) !== "show") return href;
  return `${href}${href.includes("?") ? "&" : "?"}${PAID_DIRECT_PARAM}=show`;
}

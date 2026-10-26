import type { PaidDirectView } from "@/lib/types";

// "Include Govt paid direct" (A11) on Overview and Billing is off on every
// visit. Switching it on adds `?paidDirect=show` to the page's URL, so Server
// Components compute the figures with it, and nothing is remembered: leaving
// the page (or opening it from the menu) starts off again.

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

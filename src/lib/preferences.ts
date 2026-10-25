import type { PaidDirectView } from "@/lib/types";

// Per-viewer display preferences kept in a cookie, so Server Components can
// read them (and compute totals accordingly) and they survive a reload.

/** Whether Overview and Billing include government rent paid direct (A11): "show" (default) or "hide". */
export const PAID_DIRECT_COOKIE = "bbk-paid-direct";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** The stored view; anything but "hide" means the default, shown. */
export function paidDirectViewOf(cookieValue: string | undefined): PaidDirectView {
  return cookieValue === "hide" ? "hide" : "show";
}

/** Browser only: remember the choice for a year. */
export function savePaidDirectView(view: PaidDirectView): void {
  document.cookie = `${PAID_DIRECT_COOKIE}=${view}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

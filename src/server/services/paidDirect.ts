import "server-only";
import type { PaidDirectState } from "@/lib/contracts";
import { paidDirectViewSchema } from "@/lib/validation";
import type { OwnerContext } from "./context";
import { tenantsList } from "./loaders";
import { paidDirectTenants } from "./periods";

/** The "Include Govt paid direct" view (A11) from a raw param: anything but "hide" shows it. */
export function showsPaidDirect(options: { paidDirect?: unknown }): boolean {
  return paidDirectViewSchema.parse(options.paidDirect) === "show";
}

/**
 * For the "Include Govt paid direct" switch on Overview and Billing: whether
 * there is government rent paid direct at all, and whether the view shows it.
 * Only the tenant list, so the switch never waits on a page's figures.
 */
export async function getPaidDirectState(
  _ctx: OwnerContext,
  options: { paidDirect?: unknown } = {}
): Promise<PaidDirectState> {
  return { available: paidDirectTenants(await tenantsList()).length > 0, shown: showsPaidDirect(options) };
}

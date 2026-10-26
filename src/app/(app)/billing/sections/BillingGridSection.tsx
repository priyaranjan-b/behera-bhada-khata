import type { BillingPage, BillingQuery } from "@/lib/contracts";
import BillingGrid from "../BillingGrid";

/** Billing: every tenant's rent for each month in the range, with what paid it - one page at a time (A15). */
export default async function BillingGridSection({
  grid,
  query,
  rangeLabel,
}: {
  grid: Promise<BillingPage>;
  /** The range and paid-direct view the page shows; the grid pages within it. */
  query: BillingQuery;
  rangeLabel: string;
}) {
  return <BillingGrid initial={await grid} query={query} rangeLabel={rangeLabel} />;
}

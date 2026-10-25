import type { BillingReport } from "@/lib/contracts";
import BillingGrid from "../BillingGrid";

/** Billing: every tenant's rent for each month in the range, with what paid it. */
export default async function BillingGridSection({ report, rangeLabel }: { report: Promise<BillingReport>; rangeLabel: string }) {
  const { rows } = await report;
  return <BillingGrid rows={rows} rangeLabel={rangeLabel} />;
}

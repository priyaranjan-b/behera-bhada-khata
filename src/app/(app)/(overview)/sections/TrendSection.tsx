import type { OverviewTrend } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import { paidDirectQuery } from "@/lib/preferences";
import type { PaidDirectView } from "@/lib/types";
import BillingCollectionChart from "@/components/domain/BillingCollectionChart";

/** Overview: billed vs collected over the last few months, opening Billing for that range. */
export default async function TrendSection({ trend, paidDirect }: { trend: Promise<OverviewTrend>; paidDirect: PaidDirectView }) {
  const { trend: points } = await trend;
  // With "Include Govt paid direct" on, Billing shows it too, so its figures match the chart's (A28).
  const href =
    points.length > 0
      ? routes.billing({ from: points[0].monthKey, to: points[points.length - 1].monthKey, ...paidDirectQuery(paidDirect) })
      : undefined;
  return <BillingCollectionChart data={points} href={href} paidDirect={paidDirect} />;
}

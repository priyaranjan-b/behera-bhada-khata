import type { OverviewTrend } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import BillingCollectionChart from "@/components/domain/BillingCollectionChart";

/** Overview: billed vs collected over the last few months, opening Billing for that range. */
export default async function TrendSection({ trend }: { trend: Promise<OverviewTrend> }) {
  const { trend: points } = await trend;
  const href =
    points.length > 0 ? routes.billing({ from: points[0].monthKey, to: points[points.length - 1].monthKey }) : undefined;
  return <BillingCollectionChart data={points} href={href} />;
}

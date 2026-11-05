import {
  ChartCardSkeleton,
  ContextBarSkeleton,
  DetailCardSkeleton,
  PageHeaderSkeleton,
  StatCardSkeleton,
} from "@/components/ui/Skeletons";

/**
 * The placeholder for each OverviewLayout slot, sized like the card it
 * stands in for. page.tsx uses one as each section's fallback, loading.tsx
 * fills the whole layout with them (A12) - one list, so they can't drift.
 */
export const OVERVIEW_SKELETONS = {
  header: (
    <>
      <PageHeaderSkeleton />
      <ContextBarSkeleton />
    </>
  ),
  // Three stat cards (Vacant is the fourth); Billed and Collected carry a sparkline.
  stats: Array.from({ length: 3 }, (_, i) => <StatCardSkeleton key={i} sparkline={i < 2} />),
  vacant: <StatCardSkeleton />,
  // The chart is 180px tall on phones (BillingCollectionChart).
  trend: <ChartCardSkeleton phoneHeight={180} />,
  attention: <DetailCardSkeleton rows={4} />,
  defaulters: <DetailCardSkeleton rows={5} />,
  sites: <DetailCardSkeleton rows={3} />,
  tenantTypes: <ChartCardSkeleton height={220} />,
  portfolio: <DetailCardSkeleton rows={5} />,
} satisfies Record<string, React.ReactNode>;

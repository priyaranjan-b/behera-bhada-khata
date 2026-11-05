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
  // Four stat cards (Vacant is the fifth); Billed and Collected carry a sparkline.
  stats: Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} sparkline={i < 2} />),
  vacant: <StatCardSkeleton />,
  trend: <ChartCardSkeleton />,
  // As the cards on phones (A26): all collapsible; the two to act on start open, the reference cards closed.
  attention: <DetailCardSkeleton rows={4} collapseOnPhone startOpen />,
  defaulters: <DetailCardSkeleton rows={5} collapseOnPhone startOpen />,
  sites: <DetailCardSkeleton rows={3} collapseOnPhone />,
  tenantTypes: <ChartCardSkeleton height={220} collapseOnPhone />,
  portfolio: <DetailCardSkeleton rows={5} collapseOnPhone />,
} satisfies Record<string, React.ReactNode>;

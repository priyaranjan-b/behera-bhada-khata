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
  trend: <ChartCardSkeleton />,
  // As the cards on phones (A26): the lists stop at 3, the reference cards are just their heading.
  attention: <DetailCardSkeleton rows={4} phoneRows={3} />,
  defaulters: <DetailCardSkeleton rows={5} phoneRows={3} />,
  sites: <DetailCardSkeleton rows={3} collapseOnPhone />,
  tenantTypes: <ChartCardSkeleton height={220} collapseOnPhone />,
  portfolio: <DetailCardSkeleton rows={5} collapseOnPhone />,
} satisfies Record<string, React.ReactNode>;

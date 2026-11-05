import { ContextBarSkeleton, PageHeaderSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import { BILLING_STAT_COLUMNS } from "./sections/BillingStats";

/**
 * The placeholder for each Billing section, sized like its card: page.tsx
 * uses them as fallbacks, loading.tsx shows them all (A12).
 */
export const BILLING_SKELETONS = {
  header: (
    <>
      <PageHeaderSkeleton />
      <ContextBarSkeleton />
    </>
  ),
  // Billed, Collected, Balance: three cards of the stat row (Received is the fourth).
  stats: [0, 1, 2].map((i) => (
    <StatCardSkeleton key={i} />
  )),
  received: <StatCardSkeleton />,
  grid: <PanelSkeleton />,
} satisfies Record<string, React.ReactNode>;

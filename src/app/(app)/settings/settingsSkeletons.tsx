import { DetailCardSkeleton, PageHeaderSkeleton } from "@/components/ui/Skeletons";

/** The Settings page's placeholders: page.tsx's fallbacks and loading.tsx (A12). */
export const SETTINGS_SKELETONS = {
  header: <PageHeaderSkeleton />,
  list: <DetailCardSkeleton rows={6} />,
} satisfies Record<string, React.ReactNode>;

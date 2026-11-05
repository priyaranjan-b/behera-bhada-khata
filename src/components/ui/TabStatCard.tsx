"use client";

import type { ComponentProps } from "react";
import StatCard from "./StatCard";
import { openPageTab } from "./openPageTab";

/**
 * A `StatCard` that opens a tab of the page's `PageTabs` (the tenant page's
 * Outstanding opens its Ledger): a client component, so a Server Component
 * page can place it without passing a function.
 */
export default function TabStatCard({ tab, ...props }: Omit<ComponentProps<typeof StatCard>, "href" | "onClick"> & { tab: string }) {
  return <StatCard {...props} onClick={() => openPageTab(tab)} />;
}

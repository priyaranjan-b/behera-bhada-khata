"use client";

import type { ComponentProps } from "react";
import AsyncSection from "@/components/ui/AsyncSection";
import { useOverviewMonth } from "./OverviewMonthProvider";

/**
 * An AsyncSection for one of the Overview's month cards (A31), reset on every
 * month change: after one failed fetch, ‹ › start the card fresh instead of
 * leaving its error showing for a month it no longer shows.
 */
export default function OverviewMonthSection(props: ComponentProps<typeof AsyncSection>) {
  const { monthKey } = useOverviewMonth();
  return <AsyncSection key={monthKey} {...props} />;
}

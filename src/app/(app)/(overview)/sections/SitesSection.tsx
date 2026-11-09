"use client";

import { use } from "react";
import { formatMonth } from "@/lib/dates";
import SiteCollectionCard from "@/components/domain/SiteCollectionCard";
import { useOverviewMonth } from "../OverviewMonthProvider";

/** The selected month's card (A31): the month comes from the switcher, fetched in the browser after the first render. */
export default function SitesSection() {
  const { monthKey, sites } = use(useOverviewMonth().data);
  return <SiteCollectionCard sites={sites} monthLabel={formatMonth(monthKey)} />;
}

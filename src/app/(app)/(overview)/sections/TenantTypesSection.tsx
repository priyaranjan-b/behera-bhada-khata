"use client";

import { use } from "react";
import { formatMonth } from "@/lib/dates";
import TenantTypesCard from "@/components/domain/TenantTypesCard";
import { useOverviewMonth } from "../OverviewMonthProvider";

/** The selected month's card (A31): the month comes from the switcher, fetched in the browser after the first render. */
export default function TenantTypesSection() {
  const { monthKey, kinds } = use(useOverviewMonth().data);
  return <TenantTypesCard kinds={kinds} monthLabel={formatMonth(monthKey)} />;
}

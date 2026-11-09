"use client";

import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { addMonthsToKey, formatMonth, yearMonthOf } from "@/lib/dates";
import { paidDirectQuery } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import type { PaidDirectView } from "@/lib/types";
import { useOverviewMonth } from "./OverviewMonthProvider";

/** The Overview's ‹ month ›: changes the month cards in place (A31). */
export default function OverviewMonthSwitcher({ paidDirect }: { paidDirect: PaidDirectView }) {
  const { monthKey, step } = useOverviewMonth();
  const hrefFor = (by: number) =>
    routes.dashboard({ month: yearMonthOf(addMonthsToKey(monthKey, by)), ...paidDirectQuery(paidDirect) });
  return <PeriodSwitcher label={formatMonth(monthKey)} prevHref={hrefFor(-1)} nextHref={hrefFor(1)} onStep={step} />;
}

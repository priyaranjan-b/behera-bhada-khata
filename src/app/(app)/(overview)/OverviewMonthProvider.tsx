"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { OverviewMonth } from "@/lib/contracts";
import { addMonthsToKey, yearMonthOf } from "@/lib/dates";
import { paidDirectQuery } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import type { PaidDirectView } from "@/lib/types";

interface OverviewMonthState {
  /** First of the month shown, yyyy-MM-dd. */
  monthKey: string;
  /** Its figures: `use()` it inside the section's AsyncSection, which shows the skeleton meanwhile. */
  data: Promise<OverviewMonth>;
  /** Moves the month by `step` months: one JSON GET, nothing else on the page reloads (A31). */
  step: (step: number) => void;
}

const OverviewMonthContext = createContext<OverviewMonthState | null>(null);

/** The month the Overview's month cards show, and how to change it without re-rendering the page (A31). */
export function useOverviewMonth(): OverviewMonthState {
  const value = useContext(OverviewMonthContext);
  if (!value) throw new Error("useOverviewMonth outside OverviewMonthProvider");
  return value;
}

/**
 * Holds the Overview's selected month (A31). The server renders the month in
 * the URL and passes its promise as `initial`; ‹ › then fetch the next month
 * from `/api/dashboard/overview/month` in the browser and only the three
 * month sections (stats, sites, tenant types) wait for it. The URL follows
 * through `history.replaceState`, so a reload, the "Try again" refresh or a
 * shared link renders that month on the server - and a server render (a new
 * `initial`) replaces whatever month was fetched here.
 */
export default function OverviewMonthProvider({
  initial,
  monthKey,
  paidDirect,
  children,
}: {
  initial: Promise<OverviewMonth>;
  monthKey: string;
  paidDirect: PaidDirectView;
  children: React.ReactNode;
}) {
  const [view, setView] = useState({ source: initial, monthKey, data: initial });
  // A server render (refresh, paid-direct switch, navigation) brings a new month promise: start from it.
  if (view.source !== initial) setView({ source: initial, monthKey, data: initial });

  const step = useCallback(
    (by: number) => {
      const next = addMonthsToKey(view.monthKey, by);
      window.history.replaceState(
        window.history.state,
        "",
        routes.dashboard({ month: yearMonthOf(next), ...paidDirectQuery(paidDirect) })
      );
      setView((v) => ({ ...v, monthKey: next, data: api.dashboard.overview.month(yearMonthOf(next), { paidDirect }) }));
    },
    [view.monthKey, paidDirect]
  );

  const value = useMemo(() => ({ monthKey: view.monthKey, data: view.data, step }), [view.monthKey, view.data, step]);
  return <OverviewMonthContext value={value}>{children}</OverviewMonthContext>;
}

"use client";

import { createContext, useContext, useState } from "react";
import type { Crumb } from "./AppBreadcrumbs";

type BackTarget = Required<Crumb>;

const BackTargetContext = createContext<{
  target: BackTarget | null;
  setTarget: (target: BackTarget | null) => void;
}>({ target: null, setTarget: () => {} });

/**
 * Where the phone top bar's ← goes (A37). By default the parent page from the
 * URL (`crumbsForPath`); a page opened from somewhere else sets its own with
 * `PhoneBackTarget` (Adjust payment → the tenant's Ledger).
 */
export function BackTargetProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<BackTarget | null>(null);
  return <BackTargetContext.Provider value={{ target, setTarget }}>{children}</BackTargetContext.Provider>;
}

export function useBackTarget() {
  return useContext(BackTargetContext);
}

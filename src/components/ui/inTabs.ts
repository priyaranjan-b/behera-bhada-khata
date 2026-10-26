"use client";

import { createContext, useContext } from "react";

/** True inside a `PageTabs` panel, whose tab (or phone "Section" select) already names the content. */
export const InTabsContext = createContext(false);

export function useInTabs(): boolean {
  return useContext(InTabsContext);
}

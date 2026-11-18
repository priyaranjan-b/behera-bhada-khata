"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api-client";
import type { SearchIndex } from "@/lib/contracts";

// One request per page for the top-bar search (both the desktop and the phone
// one can be mounted): the first caller on a page starts it and the rest share
// its promise. A new page fetches again, so new tenants show.
let shared: { path: string; promise: Promise<SearchIndex> } | null = null;

function fetchFor(path: string): Promise<SearchIndex> {
  if (shared?.path !== path) {
    const entry = { path, promise: api.dashboard.search() };
    shared = entry;
    // A failure isn't cached: the next load() tries again.
    entry.promise.catch(() => {
      if (shared === entry) shared = null;
    });
  }
  return shared.promise;
}

/**
 * The search index (GET /api/dashboard/search), loaded on demand by `load()`
 * on focus, and kept until the page changes. The
 * last index stays in `index` while a new page's loads.
 */
export function useSearchIndex() {
  const pathname = usePathname();
  const [state, setState] = useState<{ index: SearchIndex | null; path: string | null; loading: boolean; failed: boolean }>({
    index: null,
    path: null,
    loading: false,
    failed: false,
  });

  async function load() {
    if (state.loading || state.path === pathname) return;
    setState((s) => ({ ...s, loading: true, failed: false }));
    try {
      const index = await fetchFor(pathname);
      setState({ index, path: pathname, loading: false, failed: false });
    } catch (error) {
      // The UI says it failed; this is the trace (status/message only, no data).
      console.error("Search index failed to load", error instanceof Error ? error.message : error);
      setState((s) => ({ ...s, loading: false, failed: true }));
    }
  }

  return { index: state.index, loading: state.loading, failed: state.failed, load };
}

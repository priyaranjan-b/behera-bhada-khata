"use client";

import { useId, useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import { TAB_PARAM } from "@/lib/routes";
import { InTabsContext } from "./inTabs";

export interface PageTab {
  value: string;
  label: string;
  /** Rendered the first time the tab is opened, then kept (hidden) while another tab shows. */
  content: React.ReactNode;
}

/**
 * A record page split into tabs by where their data comes from (A16).
 *
 * Lazy and kept: a tab's content mounts the first time it is opened, so a
 * table inside loads its data then, and stays mounted when you switch away,
 * so its rows, page, sort and filters are still there on the way back with
 * no new request. A new `version` (each server render of the page, i.e.
 * after any write and `router.refresh()`) drops the kept tabs, and only the
 * open one loads again.
 *
 * The open tab is mirrored to `?tab=` without a server round trip, so a
 * reload or a shared link reopens it; a new `value` from the server (e.g. a
 * redirect to `?tab=ledger`) switches to it.
 *
 * On phones the tab row is a full-width "Section" select instead (both are
 * rendered and switched by CSS, so server and browser agree). Panels provide
 * `InTabsContext`, so a table inside drops its own title on phones.
 */
export default function PageTabs({
  tabs,
  value,
  version,
  label,
}: {
  tabs: PageTab[];
  /** The tab to open; an unknown value opens the first. */
  value?: string;
  /** Changes on every server render; see above. */
  version: string | number;
  /** Accessible name of the tab list. */
  label: string;
}) {
  const id = useId();
  const valid = (v: string | undefined) => (tabs.some((t) => t.value === v) ? (v as string) : tabs[0].value);
  const [active, setActive] = useState(() => valid(value));
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([active]));
  const [seen, setSeen] = useState({ value, version });

  // Adjust state to new props during render (not in an effect): a new tab from
  // the server opens it; a new version forgets every kept tab but the open one.
  if (seen.value !== value || seen.version !== version) {
    const next = seen.value !== value ? valid(value) : active;
    setSeen({ value, version });
    setActive(next);
    setVisited(new Set([next]));
  }

  const open = (next: string) => {
    setActive(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    const url = new URL(window.location.href);
    if (next === tabs[0].value) url.searchParams.delete(TAB_PARAM);
    else url.searchParams.set(TAB_PARAM, next);
    // Next.js syncs native history calls with its router, without a refetch.
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <TextField
        select
        fullWidth
        size="small"
        label="Section"
        value={active}
        onChange={(e) => open(e.target.value)}
        slotProps={{ htmlInput: { "aria-controls": `${id}-panel-${active}` } }}
        sx={{ display: { xs: "flex", sm: "none" }, mb: 2 }}
      >
        {tabs.map((t) => (
          <MenuItem key={t.value} value={t.value}>
            {t.label}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: { xs: "none", sm: "block" }, borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs
          value={active}
          onChange={(_, next: string) => open(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label={label}
        >
          {tabs.map((t) => (
            <Tab
              key={t.value}
              label={t.label}
              value={t.value}
              id={`${id}-tab-${t.value}`}
              aria-controls={`${id}-panel-${t.value}`}
            />
          ))}
        </Tabs>
      </Box>
      {tabs.map((t) =>
        visited.has(t.value) ? (
          <Box
            // Keyed by version, so a server render remounts (and reloads) the kept tabs.
            key={`${t.value}-${version}`}
            id={`${id}-panel-${t.value}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${t.value}`}
            hidden={t.value !== active}
            sx={{ minWidth: 0 }}
          >
            <InTabsContext.Provider value>{t.content}</InTabsContext.Provider>
          </Box>
        ) : null
      )}
    </Box>
  );
}

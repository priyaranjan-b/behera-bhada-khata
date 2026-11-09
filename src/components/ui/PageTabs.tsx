"use client";

import { useEffect, useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import useMediaQuery from "@mui/material/useMediaQuery";
import { TAB_PARAM } from "@/lib/routes";
import { InTabsContext } from "./inTabs";
import { OPEN_PAGE_TAB_EVENT } from "./openPageTab";
import { MOBILE_NAVBAR_HEIGHT, TOPBAR_HEIGHT } from "@/components/shell/nav";
import BottomNavBar, { BOTTOM_NAV_CLEARANCE } from "./BottomNavBar";

export interface PageTab {
  value: string;
  label: string;
  /** Its icon in the phone bottom bar (`phoneNav="bottom"`); may carry a Badge. */
  icon?: React.ReactNode;
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
 * On phones the tab row stays a tab row, scrolling sideways when it doesn't
 * fit (A33: a "Section" select read as a form field, and readers missed the
 * other sections). Panels provide `InTabsContext`, so a table inside drops
 * its own title on phones.
 *
 * Something else on the page opens a tab with `openPageTab` (e.g.
 * `TabStatCard`): in the browser, and the tabs scroll into view, since on a
 * phone they sit below the header.
 *
 * `phoneDefault` opens another tab on phones when the URL names none (the
 * tenant page opens Ledger there). The server can't know the screen, so it
 * renders the first tab and the phone switches right after hydrating.
 *
 * `phoneNav="bottom"` (the tenant portal, A32/A33): on phones the sections
 * are the `BottomNavBar` instead, each an icon and a label, always in view.
 * Only for a page with no other bottom bar (the owner app has its menu there)
 * and at most five tabs, each with an `icon`.
 */
export default function PageTabs({
  tabs,
  value,
  version,
  label,
  phoneDefault,
  phoneNav = "tabs",
}: {
  tabs: PageTab[];
  /** The tab to open; an unknown value opens the first. */
  value?: string;
  /** Changes on every server render; see above. */
  version: string | number;
  /** Accessible name of the tab list. */
  label: string;
  /** The tab phones open when `value` names none. */
  phoneDefault?: string;
  /** Phones: the scrollable tab row (default), or the bottom bar (see above). */
  phoneNav?: "tabs" | "bottom";
}) {
  const id = useId();
  const valid = (v: string | undefined) => (tabs.some((t) => t.value === v) ? (v as string) : tabs[0].value);
  const [active, setActive] = useState(() => valid(value));
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([active]));
  const [seen, setSeen] = useState({ value, version });
  // False on the server and while hydrating, then the real answer.
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  // Applied once, and never after the owner has picked a tab themselves.
  const [phoneSettled, setPhoneSettled] = useState(false);

  // Adjust state to new props during render (not in an effect): a new tab from
  // the server opens it; a new version forgets every kept tab but the open one.
  if (seen.value !== value || seen.version !== version) {
    const next = seen.value !== value ? valid(value) : active;
    setSeen({ value, version });
    setActive(next);
    setVisited(new Set([next]));
  }
  if (!phoneSettled && isPhone) {
    setPhoneSettled(true);
    if (value === undefined && phoneDefault && tabs.some((t) => t.value === phoneDefault)) {
      setActive(phoneDefault);
      setVisited((prev) => new Set(prev).add(phoneDefault));
    }
  }

  const open = (next: string) => {
    setPhoneSettled(true);
    setActive(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    const url = new URL(window.location.href);
    if (next === tabs[0].value) url.searchParams.delete(TAB_PARAM);
    else url.searchParams.set(TAB_PARAM, next);
    // Next.js syncs native history calls with its router, without a refetch.
    window.history.replaceState(window.history.state, "", url);
  };

  // `openPageTab` from elsewhere on the page: open the tab and bring the tabs into view.
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (!tabs.some((t) => t.value === next)) return;
      openRef.current(next);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(OPEN_PAGE_TAB_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_TAB_EVENT, onOpen);
  }, [tabs]);

  return (
    // Scrolled to below the fixed top bar.
    <Box
      ref={rootRef}
      sx={{
        minWidth: 0,
        scrollMarginTop: { xs: MOBILE_NAVBAR_HEIGHT + 8, md: TOPBAR_HEIGHT + 8 },
        // Room under the last row for the bottom bar, so it never covers the table's pager.
        pb: phoneNav === "bottom" ? { xs: BOTTOM_NAV_CLEARANCE, sm: 0 } : undefined,
      }}
    >
      {phoneNav === "bottom" ? (
        <BottomNavBar
          label={label}
          hideFrom="sm"
          value={active}
          onChange={open}
          items={tabs.map((t) => ({ value: t.value, label: t.label, icon: t.icon, controls: `${id}-panel-${t.value}` }))}
        />
      ) : null}
      <Box
        sx={{ display: { xs: phoneNav === "bottom" ? "none" : "block", sm: "block" }, borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
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

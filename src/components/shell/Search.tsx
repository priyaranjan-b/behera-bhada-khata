"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Loader, useAppRouter } from "@/components/ui/Loading";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { outlinedInputClasses } from "@mui/material/OutlinedInput";
import TextField from "@mui/material/TextField";
import type { Theme } from "@mui/material/styles";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { api } from "@/lib/api-client";
import type { SearchIndex } from "@/lib/contracts";
import { searchSuggestions, type SearchSuggestion } from "@/lib/domain/search";
import { brand, gray } from "@/theme/themePrimitives";
import { slate } from "@/theme/appTokens";

// The top bar's one call to action, so it stands out as a raised field: a
// white surface with a soft, layered indigo shadow and a thin top highlight
// (depth without a heavy bevel), lifting a touch on hover and glowing in the
// brand colour when focused. Movement is dropped for reduced-motion users.
const searchSx = (theme: Theme) => ({
  height: 40,
  py: 0,
  borderRadius: "12px",
  backgroundColor: "#FFFFFF",
  borderColor: `color-mix(in srgb, ${brand[200]} 45%, ${slate[200]})`,
  boxShadow:
    "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(15, 23, 42, 0.06), 0 6px 16px -6px rgba(67, 56, 202, 0.22)",
  transition: theme.transitions.create(["border-color", "box-shadow", "transform"], {
    duration: theme.transitions.duration.shorter,
  }),
  "&:hover": {
    borderColor: brand[200],
    transform: "translateY(-1px)",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 4px rgba(15, 23, 42, 0.06), 0 10px 22px -8px rgba(67, 56, 202, 0.3)",
  },
  [`&.${outlinedInputClasses.focused}`]: {
    outline: "none",
    transform: "none",
    borderColor: brand[400],
    boxShadow: `0 0 0 4px color-mix(in srgb, ${brand[400]} 16%, transparent), 0 12px 28px -10px rgba(67, 56, 202, 0.38)`,
  },
  [`& .${outlinedInputClasses.input}::placeholder`]: { color: slate[500], opacity: 1 },
  "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } },
  ...theme.applyStyles("dark", {
    backgroundColor: `color-mix(in srgb, ${brand[800]} 30%, ${(theme.vars || theme).palette.background.paper})`,
    borderColor: "rgba(255, 255, 255, 0.10)",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 18px -8px rgba(0, 0, 0, 0.8)",
    "&:hover": {
      borderColor: "rgba(255, 255, 255, 0.18)",
      transform: "translateY(-1px)",
      boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 24px -8px rgba(0, 0, 0, 0.9)",
    },
    [`&.${outlinedInputClasses.focused}`]: {
      borderColor: brand[300],
      transform: "none",
      boxShadow: `0 0 0 4px color-mix(in srgb, ${brand[300]} 22%, transparent), 0 12px 28px -10px rgba(0, 0, 0, 0.9)`,
    },
    [`& .${outlinedInputClasses.input}::placeholder`]: { color: gray[400] },
  }),
});

const noSubscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The "Ctrl K" / "⌘ K" hint at the end of the desktop search field. */
function ShortcutHint({ mac }: { mac: boolean }) {
  return (
    <Box
      component="kbd"
      aria-hidden
      sx={(theme) => ({
        px: 0.75,
        py: 0.25,
        borderRadius: "6px",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        color: slate[500],
        backgroundColor: slate[50],
        border: `1px solid ${slate[200]}`,
        boxShadow: `0 1px 0 ${slate[200]}`,
        ...theme.applyStyles("dark", {
          color: gray[400],
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderColor: "rgba(255, 255, 255, 0.12)",
          boxShadow: "0 1px 0 rgba(255, 255, 255, 0.08)",
        }),
      })}
    >
      {mac ? "⌘ K" : "Ctrl K"}
    </Box>
  );
}

/**
 * Global search in the top bar: suggests tenants (by name or business) and
 * houses (by nickname, code or house number) as you type, and opens the
 * chosen one's page. The index is fetched on first focus and again after
 * navigating, so new tenants show up; matching runs in the browser
 * (src/lib/domain/search.ts). On phones AppNavbar opens it with `autoFocus`
 * and closes it through `onNavigate`.
 */
export function Search({
  autoFocus = false,
  onNavigate,
  showShortcut = false,
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  /** Desktop top bar: show the Ctrl/⌘ K hint and listen for it. */
  showShortcut?: boolean;
}) {
  const router = useAppRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // "Ctrl K" on the server and first paint, "⌘ K" in the browser on a Mac.
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);

  // Ctrl K (⌘ K on a Mac) focuses the search from anywhere on the page.
  useEffect(() => {
    if (!showShortcut) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showShortcut]);
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState<{ data: SearchIndex; path: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    if (loading || index?.path === pathname) return;
    setLoading(true);
    setFailed(false);
    try {
      setIndex({ data: await api.dashboard.search(), path: pathname });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const options = useMemo(() => (index ? searchSuggestions(index.data, query) : []), [index, query]);

  function choose(option: SearchSuggestion | null) {
    if (!option) return;
    setQuery("");
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(option.href);
    onNavigate?.();
  }

  return (
    <Autocomplete
      id="global-search"
      size="small"
      fullWidth
      options={options}
      value={null}
      inputValue={query}
      onInputChange={(_e, value, reason) => {
        if (reason !== "reset") setQuery(value);
      }}
      onChange={(_e, key) => choose(options.find((o) => o.key === key) ?? null)}
      open={focused && query.trim() !== ""}
      onFocus={() => {
        setFocused(true);
        void load();
      }}
      onBlur={() => setFocused(false)}
      // searchSuggestions already filtered and ranked them.
      filterOptions={(x) => x}
      getOptionLabel={(option) => option.primary}
      getOptionKey={(option) => option.key}
      getOptionValue={(option) => option.key}
      isOptionEqualToValue={(option, key) => option.key === key}
      groupBy={(option) => (option.kind === "tenant" ? "Tenants" : "Houses")}
      autoHighlight
      forcePopupIcon={false}
      loading={loading && !index}
      loadingText="Loading…"
      noOptionsText={failed ? "Couldn't load search - try again" : "No tenants or houses match"}
      renderOption={({ key, ...props }, option) => (
        <li key={key} {...props}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            {option.kind === "tenant" ? <PersonOutlineIcon fontSize="small" /> : <HomeWorkOutlinedIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText primary={option.primary} secondary={option.secondary || undefined} />
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search tenant, business or house…"
          autoFocus={autoFocus}
          inputRef={inputRef}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start" sx={{ color: brand[400] }}>
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: loading ? (
                <Loader size="sm" />
              ) : showShortcut && !focused && !query ? (
                <InputAdornment position="end">
                  <ShortcutHint mac={mac} />
                </InputAdornment>
              ) : (
                params.slotProps.input.endAdornment
              ),
              sx: searchSx,
            },
            htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Search" },
          }}
        />
      )}
    />
  );
}

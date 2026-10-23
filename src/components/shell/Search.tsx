"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
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
import { gray } from "@/theme/themePrimitives";
import { slate } from "@/theme/appTokens";

// Quieter than form inputs: hairline border and a neutral focus state instead
// of the template's indigo outline ring (it's chrome, not a form field).
const searchSx = (theme: Theme) => ({
  height: 36,
  py: 0,
  borderColor: slate[200],
  transition: theme.transitions.create(["border-color", "box-shadow"], { duration: theme.transitions.duration.shorter }),
  "&:hover": { borderColor: slate[400] },
  [`&.${outlinedInputClasses.focused}`]: {
    outline: "none",
    borderColor: slate[400],
    boxShadow: "0 0 0 3px rgba(148, 163, 184, 0.2)", // slate-400 @ 20%
  },
  [`& .${outlinedInputClasses.input}::placeholder`]: { color: slate[500], opacity: 1 },
  ...theme.applyStyles("dark", {
    borderColor: (theme.vars || theme).palette.divider,
    "&:hover": { borderColor: gray[500] },
    [`&.${outlinedInputClasses.focused}`]: { borderColor: gray[400], boxShadow: "0 0 0 3px rgba(148, 163, 184, 0.15)" },
    [`& .${outlinedInputClasses.input}::placeholder`]: { color: gray[400] },
  }),
});

/**
 * Global search in the top bar: suggests tenants (by name or business) and
 * houses (by nickname, code or house number) as you type, and opens the
 * chosen one's page. The index is fetched on first focus and again after
 * navigating, so new tenants show up; matching runs in the browser
 * (src/lib/domain/search.ts). On phones AppNavbar opens it with `autoFocus`
 * and closes it through `onNavigate`.
 */
export function Search({ autoFocus = false, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
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
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start" sx={{ color: "text.secondary" }}>
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: loading ? <CircularProgress color="inherit" size={16} /> : params.slotProps.input.endAdornment,
              sx: searchSx,
            },
            htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Search" },
          }}
        />
      )}
    />
  );
}

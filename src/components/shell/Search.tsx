"use client";

import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput, { outlinedInputClasses } from "@mui/material/OutlinedInput";
import type { Theme } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
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
 * Global search box in the top bar (template Search). UI only for now —
 * searching tenants/properties will be wired up later.
 */
export function Search() {
  return (
    <FormControl variant="outlined" size="small" fullWidth>
      <OutlinedInput
        id="global-search"
        type="search"
        placeholder="Search tenants, properties…"
        startAdornment={
          <InputAdornment position="start" sx={{ color: "text.secondary" }}>
            <SearchRoundedIcon fontSize="small" />
          </InputAdornment>
        }
        inputProps={{ "aria-label": "Search" }}
        sx={searchSx}
      />
    </FormControl>
  );
}

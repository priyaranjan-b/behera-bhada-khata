"use client";

import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { DataTableFilter } from "./context";
import { pillControlSx } from "./styles";

/** A "Show: …" select (the toolbar on wide screens, the filter sheet on phones). */
export default function ShowFilter({ filter, sx }: { filter: DataTableFilter; sx: object }) {
  return (
    <TextField
      select
      size="small"
      value={filter.value}
      onChange={(e) => filter.onChange(e.target.value)}
      aria-label={filter.label}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 0.5 }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 500 }}>
                {filter.label}:
              </Typography>
            </InputAdornment>
          ),
        },
      }}
      sx={{ ...pillControlSx, ...sx }}
    >
      {filter.options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

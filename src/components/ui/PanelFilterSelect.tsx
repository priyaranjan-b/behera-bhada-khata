"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

/** Compact select for panel headers (status / date-mode filters). */
export default function PanelFilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      sx={{ minWidth: 150 }}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

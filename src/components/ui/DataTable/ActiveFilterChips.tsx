"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useDataTable } from "./context";
import FilterChip from "./FilterChip";
import { useColumnFilter } from "./useColumnFilter";
import { useTableFilters } from "./useTableFilters";

/**
 * On a phone, what narrows the table once the filter sheet is closed (A30):
 * one swipe row of chips for the "Show" selects away from their default, the
 * table's own inputs (`toolbarExtraFilter`, e.g. dates) and the column
 * filter. Each ✕ removes just that one; the filter icon opens the sheet.
 * It stays under an open search, since these still narrow the results.
 */
export default function ActiveFilterChips() {
  const config = useDataTable();
  const { changedFilters, clearAll } = useTableFilters();
  const column = useColumnFilter();
  const extra = config.toolbarExtraFilter;
  const chipCount = changedFilters.length + (extra ? 1 : 0) + (column.label ? 1 : 0);
  if (chipCount === 0) return null;

  return (
    <Stack
      direction="row"
      spacing={1}
      role="group"
      aria-label={config.title ? `${config.title} filters` : "Active filters"}
      sx={{
        alignItems: "center",
        overflowX: "auto",
        px: 2,
        pb: 1.25,
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      {changedFilters.map((filter) => {
        const option = filter.options.find((o) => o.value === filter.value)?.label ?? filter.value;
        return (
          <FilterChip
            key={filter.label}
            label={`${filter.label}: ${option}`}
            onRemove={() => filter.onChange(filter.defaultValue)}
          />
        );
      })}
      {extra ? <FilterChip label={extra.label} onRemove={extra.onClear} /> : null}
      {column.label ? <FilterChip label={column.label} onRemove={column.clear} /> : null}
      {chipCount > 1 ? (
        <Button size="small" onClick={() => clearAll({ keepSearch: true })} sx={{ flexShrink: 0 }}>
          Clear all
        </Button>
      ) : null}
    </Stack>
  );
}

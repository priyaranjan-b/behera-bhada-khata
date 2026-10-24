"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import {
  gridFilterActiveItemsSelector,
  gridQuickFilterValuesSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";
import { IconTile } from "@/components/ui/Surfaces";
import { useDataTable } from "./context";

/**
 * Shown when filters leave nothing to list (either the grid's own search /
 * filter panel or the toolbar's "Show" selects), with a way back out.
 */
export default function DataTableNoResults() {
  const { noRowsLabel, filters } = useDataTable();
  const apiRef = useGridApiContext();
  const filterItems = useGridSelector(apiRef, gridFilterActiveItemsSelector);
  const quickValues = useGridSelector(apiRef, gridQuickFilterValuesSelector);

  const changedFilters = filters.filter((f) => f.defaultValue !== undefined && f.value !== f.defaultValue);
  const canClear = filterItems.length > 0 || (quickValues?.length ?? 0) > 0 || changedFilters.length > 0;

  function clearAll() {
    apiRef.current.setFilterModel({ items: [], quickFilterValues: [] });
    for (const f of changedFilters) f.onChange(f.defaultValue);
  }

  return (
    <Stack spacing={1} sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3, py: 3 }}>
      <IconTile icon={<SearchOffRoundedIcon />} tone="neutral" />
      <Typography variant="body2" color="textSecondary">
        {noRowsLabel}
      </Typography>
      {canClear ? (
        <Button size="small" onClick={clearAll}>
          Clear filters
        </Button>
      ) : null}
    </Stack>
  );
}

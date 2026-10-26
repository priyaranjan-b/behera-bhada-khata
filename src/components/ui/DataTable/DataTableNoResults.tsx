"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import { IconTile } from "@/components/ui/Surfaces";
import { useDataTable } from "./context";
import { useTableFilters } from "./useTableFilters";

/**
 * Shown when filters leave nothing to list (either the grid's own search /
 * filter panel or the toolbar's "Show" selects), with a way back out.
 */
export default function DataTableNoResults() {
  const { noRowsLabel } = useDataTable();
  const { canClear, clearAll } = useTableFilters();

  return (
    <Stack spacing={1} sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3, py: 3 }}>
      <IconTile icon={<SearchOffRoundedIcon />} tone="neutral" />
      <Typography variant="body2" color="textSecondary">
        {noRowsLabel}
      </Typography>
      {canClear ? (
        <Button size="small" onClick={() => clearAll()}>
          Clear filters
        </Button>
      ) : null}
    </Stack>
  );
}

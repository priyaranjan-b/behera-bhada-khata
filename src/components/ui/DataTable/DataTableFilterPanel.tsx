"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import {
  GridFilterPanel,
  gridFilterActiveItemsSelector,
  useGridApiContext,
  useGridSelector,
  type GridFilterPanelProps,
} from "@mui/x-data-grid";

/**
 * The grid's column filter panel (wide screens) with a footer: "Clear filter" and
 * "Done", so it closes with a button and not only a click outside (A30).
 * The free grid draws no footer of its own.
 */
export default function DataTableFilterPanel(props: GridFilterPanelProps) {
  const apiRef = useGridApiContext();
  const active = useGridSelector(apiRef, gridFilterActiveItemsSelector);
  return (
    <Stack sx={{ minWidth: 0 }}>
      <GridFilterPanel {...props} />
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "flex-end", px: 1.5, py: 1.25, borderTop: 1, borderColor: "divider" }}
      >
        {active.length > 0 ? (
          <Button
            size="small"
            onClick={() => apiRef.current.setFilterModel({ ...apiRef.current.state.filter.filterModel, items: [] })}
          >
            Clear filter
          </Button>
        ) : null}
        <Button size="small" variant="contained" onClick={() => apiRef.current.hideFilterPanel()}>
          Done
        </Button>
      </Stack>
    </Stack>
  );
}

"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import BottomSheet from "../BottomSheet";
import { InSheetContext } from "../inSheet";
import ColumnFilterSection from "./ColumnFilterSection";
import { useDataTable } from "./context";
import ExtraInputs from "./ExtraInputs";
import ShowFilter from "./ShowFilter";
import { useColumnFilter } from "./useColumnFilter";
import { useTableFilters } from "./useTableFilters";

/**
 * Every filter of a table on a phone, in one bottom sheet (A30): the "Show"
 * selects and `toolbarExtra`, then the column filter (`ColumnFilterSection`).
 * Filters apply as they change; the footer's button says how many rows
 * that leaves and closes the sheet, as do ✕, a swipe down and a tap outside.
 */
export default function DataTableFilterSheet({
  open,
  onClose,
  id,
  visible,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  /** Rows the filters leave now (across all pages). */
  visible: number;
}) {
  const config = useDataTable();
  const { canClearFilters, clearAll } = useTableFilters();
  const column = useColumnFilter();
  // Bumped by "Clear all": remounts the column controls, dropping any half-typed text.
  const [resets, setResets] = useState(0);
  const showSection = config.filters.length > 0 || Boolean(config.toolbarExtra);
  const columnSection = config.filterButton && (column.columns.length > 0 || column.current.state === "other");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      id={id}
      footer={
        <>
          <Button
            onClick={() => {
              clearAll({ keepSearch: true });
              setResets((n) => n + 1);
            }}
            disabled={!canClearFilters}
          >
            Clear all
          </Button>
          <Button variant="contained" onClick={onClose} sx={{ flex: 1 }}>
            Show {visible} {visible === 1 ? "row" : "rows"}
          </Button>
        </>
      }
    >
      <InSheetContext.Provider value>
        <Stack spacing={2.5} sx={{ pt: 0.5, pb: 2 }}>
          {showSection ? (
            <Stack spacing={1.25} component="section" aria-label="Show">
              {config.filters.map((filter) => (
                <ShowFilter key={filter.label} filter={filter} sx={{ width: "100%" }} />
              ))}
              {config.toolbarExtra ? <ExtraInputs fill>{config.toolbarExtra}</ExtraInputs> : null}
            </Stack>
          ) : null}
          {columnSection ? <ColumnFilterSection key={resets} {...column} /> : null}
        </Stack>
      </InSheetContext.Provider>
    </BottomSheet>
  );
}

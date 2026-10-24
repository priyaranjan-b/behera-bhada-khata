"use client";

import { useId } from "react";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import {
  gridPageCountSelector,
  gridPaginationModelSelector,
  gridPaginationRowCountSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";
import { useDataTable } from "./context";

/** "Rows 10 ▾ ……… 1–10 of 26  ‹ 1 2 3 ›"; just "‹ 2 / 3 ›" on phones. */
export default function DataTablePagination() {
  const { pageSizeOptions } = useDataTable();
  const apiRef = useGridApiContext();
  const { page, pageSize } = useGridSelector(apiRef, gridPaginationModelSelector);
  const pageCount = useGridSelector(apiRef, gridPageCountSelector);
  const rowCount = useGridSelector(apiRef, gridPaginationRowCountSelector);
  const sizeId = useId();
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  const from = rowCount === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(rowCount, (page + 1) * pageSize);

  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%", px: 2, py: 1 }}
    >
      {compact ? null : (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="caption" color="textSecondary" component="label" htmlFor={sizeId}>
            Rows
          </Typography>
          <Select
            size="small"
            value={pageSize}
            onChange={(e) => apiRef.current.setPageSize(Number(e.target.value))}
            inputProps={{ id: sizeId, "aria-label": "Rows per page" }}
            sx={{ height: 32, fontSize: "0.8125rem", borderRadius: 999, "& .MuiSelect-select": { py: 0.5 } }}
          >
            {pageSizeOptions.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      )}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", ml: "auto" }}>
        <Typography variant="caption" color="textSecondary" aria-live="polite">
          {compact ? `${page + 1} / ${pageCount}` : `${from}–${to} of ${rowCount}`}
        </Typography>
        <Pagination
          size="small"
          shape="rounded"
          color="primary"
          count={pageCount}
          page={page + 1}
          siblingCount={compact ? 0 : 1}
          boundaryCount={compact ? 0 : 1}
          onChange={(_e, value) => apiRef.current.setPage(value - 1)}
          sx={compact ? { "& .MuiPaginationItem-page, & .MuiPaginationItem-ellipsis": { display: "none" } } : undefined}
        />
      </Stack>
    </Stack>
  );
}

"use client";

import { useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ViewColumnOutlinedIcon from "@mui/icons-material/ViewColumnOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import {
  ColumnsPanelTrigger,
  ExportCsv,
  FilterPanelTrigger,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  QuickFilterTrigger,
  Toolbar,
  ToolbarButton,
  gridFilteredTopLevelRowCountSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";
import { useDataTable } from "./context";
import { downloadGridAsExcel } from "./exportExcel";
import { pillControlSx, TOOL_BUTTON, toolbarIconButtonSx } from "./styles";

/**
 * One row: title + count on the left; "Show" filters, extra inputs, search,
 * filter and columns on the right. Wraps under the title on narrow screens.
 */
export default function DataTableToolbar() {
  const config = useDataTable();
  const apiRef = useGridApiContext();
  const visible = useGridSelector(apiRef, gridFilteredTopLevelRowCountSelector);
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));
  const count = visible === config.totalCount ? `${visible}` : `${visible} of ${config.totalCount}`;

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 2,
        rowGap: 1.25,
        px: 2,
        py: 1.25,
        minHeight: 60,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {config.title ? (
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography id={config.titleId} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {config.title}
            </Typography>
            <Chip size="small" label={count} aria-label={`${count} rows`} sx={{ height: 22, fontWeight: 500 }} />
          </Stack>
          {config.subtitle ? (
            <Typography variant="caption" color="textSecondary" component="p" noWrap>
              {config.subtitle}
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Box sx={{ flex: "1 1 auto" }} />
      )}

      <Stack
        direction="row"
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, justifyContent: "flex-end", minWidth: 0 }}
      >
        {config.filters.map((filter) => (
          <TextField
            key={filter.label}
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
            sx={{ ...pillControlSx, minWidth: 150 }}
          >
            {filter.options.map((o: { value: string; label: string }) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        ))}

        {config.toolbarExtra ? (
          <Box sx={{ ...pillControlSx, "& .MuiInputBase-root": { borderRadius: 999, height: 36 } }}>
            {config.toolbarExtra}
          </Box>
        ) : null}

        {/* The grid's Toolbar gives the buttons roving-tabindex keyboard nav; its own frame is replaced. */}
        <Toolbar
          aria-label={config.title ? `${config.title} table controls` : "Table controls"}
          render={(props) => (
            <Stack {...props} direction="row" sx={{ alignItems: "center", gap: 0.75, [`& .${TOOL_BUTTON}`]: toolbarIconButtonSx }} />
          )}
        >
          {config.search ? <SearchControl placeholder={config.search.placeholder} collapsed={compact} /> : null}

          {config.filterButton ? (
            <FilterPanelTrigger
              render={(triggerProps, state) => (
                <Tooltip title={state.filterCount > 0 ? `Filters (${state.filterCount} active)` : "Filters"}>
                  <ToolbarButton
                    {...triggerProps}
                    aria-label="Filters"
                    color={state.filterCount > 0 ? "primary" : "default"}
                    className={TOOL_BUTTON}
                  >
                    <Badge badgeContent={state.filterCount} color="primary" overlap="circular">
                      <FilterListRoundedIcon fontSize="small" />
                    </Badge>
                  </ToolbarButton>
                </Tooltip>
              )}
            />
          ) : null}

          {config.columnsButton ? (
            <Tooltip title="Columns">
              <ColumnsPanelTrigger render={<ToolbarButton aria-label="Columns" className={TOOL_BUTTON} />}>
                <ViewColumnOutlinedIcon fontSize="small" />
              </ColumnsPanelTrigger>
            </Tooltip>
          ) : null}

          {config.exportCsv ? (
            <Tooltip title="Download CSV">
              <ExportCsv render={<ToolbarButton aria-label="Download CSV" className={TOOL_BUTTON} />}>
                <FileDownloadOutlinedIcon fontSize="small" />
              </ExportCsv>
            </Tooltip>
          ) : null}

          {config.exportExcel ? (
            <Tooltip title="Download Excel">
              <ToolbarButton
                aria-label={config.title ? `Download ${config.title} as Excel` : "Download Excel"}
                className={TOOL_BUTTON}
                onClick={() => downloadGridAsExcel(apiRef, config.title)}
              >
                <GridOnOutlinedIcon fontSize="small" />
              </ToolbarButton>
            </Tooltip>
          ) : null}
        </Toolbar>
      </Stack>
    </Stack>
  );
}

/** Inline search field; on phones an icon that expands into the field. */
function SearchControl({ placeholder = "Search…", collapsed }: { placeholder?: string; collapsed: boolean }) {
  // Controlled, so it follows the breakpoint after hydration (the server renders the wide layout).
  const [open, setOpen] = useState(false);
  return (
    <QuickFilter
      debounceMs={200}
      expanded={!collapsed || open}
      onExpandedChange={setOpen}
      render={(props, state) => (
        <Stack {...props} direction="row" sx={{ alignItems: "center" }}>
          {collapsed && !state.expanded ? (
            <Tooltip title="Search">
              <QuickFilterTrigger render={<ToolbarButton aria-label="Search" className={TOOL_BUTTON} />}>
                <SearchRoundedIcon fontSize="small" />
              </QuickFilterTrigger>
            </Tooltip>
          ) : (
            <QuickFilterControl
              render={({ ref, slotProps: _slotProps, ...controlProps }) => (
                <TextField
                  {...controlProps}
                  inputRef={ref}
                  size="small"
                  placeholder={placeholder}
                  aria-label={placeholder}
                  autoFocus={collapsed}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: state.value ? (
                        <InputAdornment position="end">
                          <QuickFilterClear render={<IconButton size="small" edge="end" aria-label="Clear search" />}>
                            <CloseRoundedIcon fontSize="small" />
                          </QuickFilterClear>
                        </InputAdornment>
                      ) : null,
                    },
                  }}
                  sx={{ ...pillControlSx, width: { xs: 180, sm: 220 } }}
                />
              )}
            />
          )}
        </Stack>
      )}
    />
  );
}

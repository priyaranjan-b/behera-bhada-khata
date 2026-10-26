"use client";

import { useId, useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import { visuallyHidden } from "@mui/utils";
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
import { useInTabs } from "../inTabs";
import { useDataTable, type DataTableFilter } from "./context";
import { downloadGridAsExcel } from "./exportExcel";
import { pillControlSx, TOOL_BUTTON, toolbarIconButtonSx } from "./styles";
import { useTableFilters } from "./useTableFilters";

/**
 * One row: title + count on the left; "Show" filters, extra inputs, search,
 * filter and columns on the right. Wraps under the title on narrow screens.
 *
 * Phones get one short row instead: the count (and the title, unless a
 * `PageTabs` section already names the table), then icons. The "Show"
 * selects, `toolbarExtra` and the column filters move into a panel the
 * filter icon opens (its badge counts what's active), and search expands
 * across the whole row.
 */
export default function DataTableToolbar() {
  const config = useDataTable();
  const apiRef = useGridApiContext();
  const filtered = useGridSelector(apiRef, gridFilteredTopLevelRowCountSelector);
  const visible = config.matchingCount ?? filtered;
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));
  const inTabs = useInTabs();
  const { changedFilters, columnFilterCount, canClear, clearAll } = useTableFilters();
  const [searchOpen, setSearchOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const paged = config.matchingCount !== undefined;
  const count = visible === config.totalCount ? `${visible}` : `${visible} of ${config.totalCount}`;

  const hasPanel = compact && (config.filters.length > 0 || Boolean(config.toolbarExtra) || config.filterButton);
  const activeCount = changedFilters.length + columnFilterCount + (config.toolbarExtraActive ? 1 : 0);
  // On a phone an open search takes the whole row.
  const searchOnly = compact && searchOpen;
  const showTitle = !(compact && inTabs);

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          flexWrap: compact ? "nowrap" : "wrap",
          columnGap: compact ? 1 : 2,
          rowGap: 1.25,
          px: 2,
          py: compact ? 1 : 1.25,
          minHeight: compact ? 52 : 60,
        }}
      >
        {searchOnly ? null : (
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              {config.title ? (
                <Typography
                  id={config.titleId}
                  component="h2"
                  variant="subtitle1"
                  noWrap
                  // Still there for aria-labelledby when a tab already shows the name.
                  sx={showTitle ? { fontWeight: 600 } : visuallyHidden}
                >
                  {config.title}
                </Typography>
              ) : null}
              <Chip size="small" label={count} aria-label={`${count} rows`} sx={{ height: 22, fontWeight: 500 }} />
            </Stack>
            {config.subtitle && !compact ? (
              <Typography variant="caption" color="textSecondary" component="p" noWrap>
                {config.subtitle}
              </Typography>
            ) : null}
          </Box>
        )}

        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            flexWrap: compact ? "nowrap" : "wrap",
            gap: 1,
            justifyContent: "flex-end",
            minWidth: 0,
            flex: searchOnly ? "1 1 auto" : undefined,
          }}
        >
          {compact
            ? null
            : config.filters.map((filter) => <ShowFilter key={filter.label} filter={filter} sx={{ minWidth: 150 }} />)}

          {config.toolbarExtra && !compact ? <ExtraInputs>{config.toolbarExtra}</ExtraInputs> : null}

          {/* The grid's Toolbar gives the buttons roving-tabindex keyboard nav; its own frame is replaced. */}
          <Toolbar
            aria-label={config.title ? `${config.title} table controls` : "Table controls"}
            render={(props) => (
              <Stack
                {...props}
                direction="row"
                sx={{
                  alignItems: "center",
                  gap: 0.75,
                  flex: searchOnly ? "1 1 auto" : undefined,
                  [`& .${TOOL_BUTTON}`]: toolbarIconButtonSx,
                }}
              />
            )}
          >
            {config.search ? (
              <SearchControl
                placeholder={config.search.placeholder}
                collapsed={compact}
                open={searchOpen}
                onOpenChange={setSearchOpen}
              />
            ) : null}

            {searchOnly ? null : hasPanel ? (
              <Tooltip title={activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"}>
                <ToolbarButton
                  aria-label="Filters"
                  aria-expanded={panelOpen}
                  aria-controls={panelId}
                  color={activeCount > 0 || panelOpen ? "primary" : "default"}
                  className={TOOL_BUTTON}
                  onClick={() => setPanelOpen((open) => !open)}
                >
                  <Badge badgeContent={activeCount} color="primary" overlap="circular">
                    <FilterListRoundedIcon fontSize="small" />
                  </Badge>
                </ToolbarButton>
              </Tooltip>
            ) : config.filterButton ? (
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

            {config.columnsButton && !searchOnly ? (
              <Tooltip title="Columns">
                <ColumnsPanelTrigger render={<ToolbarButton aria-label="Columns" className={TOOL_BUTTON} />}>
                  <ViewColumnOutlinedIcon fontSize="small" />
                </ColumnsPanelTrigger>
              </Tooltip>
            ) : null}

            {config.exportCsv && !searchOnly ? (
              <Tooltip title="Download CSV">
                <ExportCsv render={<ToolbarButton aria-label="Download CSV" className={TOOL_BUTTON} />}>
                  <FileDownloadOutlinedIcon fontSize="small" />
                </ExportCsv>
              </Tooltip>
            ) : null}

            {config.exportExcel && !searchOnly ? (
              <Tooltip title={paged ? "Download this page (Excel)" : "Download Excel"}>
                <ToolbarButton
                  aria-label={
                    config.title
                      ? `Download ${paged ? "this page of " : ""}${config.title} as Excel`
                      : paged
                        ? "Download this page (Excel)"
                        : "Download Excel"
                  }
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

      {hasPanel ? (
        <Collapse in={panelOpen} id={panelId}>
          <Stack spacing={1.25} sx={{ px: 2, pb: 1.5 }}>
            {config.filters.map((filter) => (
              <ShowFilter key={filter.label} filter={filter} sx={{ width: "100%" }} />
            ))}
            {config.toolbarExtra ? <ExtraInputs fill>{config.toolbarExtra}</ExtraInputs> : null}
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              {config.filterButton ? (
                <FilterPanelTrigger
                  render={(triggerProps, state) => (
                    <Button {...triggerProps} size="small" variant="outlined" startIcon={<FilterListRoundedIcon />}>
                      Column filters{state.filterCount > 0 ? ` (${state.filterCount})` : ""}
                    </Button>
                  )}
                />
              ) : (
                <span />
              )}
              {canClear ? (
                <Button size="small" onClick={() => clearAll({ keepSearch: true })}>
                  Clear
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </Collapse>
      ) : null}
    </Box>
  );
}

/** A "Show: …" select. */
function ShowFilter({ filter, sx }: { filter: DataTableFilter; sx: object }) {
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

/** The caller's own inputs (e.g. dates) as pills; `fill` stretches them across the phone panel. */
function ExtraInputs({ fill = false, children }: { fill?: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        ...pillControlSx,
        "& .MuiInputBase-root": { borderRadius: 999, height: 36 },
        ...(fill ? { "& > *": { width: "100%" }, "& .MuiTextField-root": { flex: 1, minWidth: 0 } } : {}),
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Inline search field; on phones an icon that expands into a field across
 * the row, whose close button clears it.
 */
function SearchControl({
  placeholder = "Search…",
  collapsed,
  open,
  onOpenChange,
}: {
  placeholder?: string;
  collapsed: boolean;
  /** Controlled, so it follows the breakpoint after hydration (the server renders the wide layout). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apiRef = useGridApiContext();
  return (
    <QuickFilter
      debounceMs={200}
      expanded={!collapsed || open}
      onExpandedChange={onOpenChange}
      render={(props, state) => (
        <Stack {...props} direction="row" sx={{ alignItems: "center", flex: collapsed && open ? "1 1 auto" : undefined }}>
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
                      endAdornment: collapsed ? (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            edge="end"
                            aria-label="Close search"
                            onClick={() => {
                              apiRef.current.setQuickFilterValues([]);
                              onOpenChange(false);
                            }}
                          >
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ) : state.value ? (
                        <InputAdornment position="end">
                          <QuickFilterClear render={<IconButton size="small" edge="end" aria-label="Clear search" />}>
                            <CloseRoundedIcon fontSize="small" />
                          </QuickFilterClear>
                        </InputAdornment>
                      ) : null,
                    },
                  }}
                  sx={{ ...pillControlSx, width: collapsed ? "100%" : 220 }}
                />
              )}
            />
          )}
        </Stack>
      )}
    />
  );
}

import { gridClasses } from "@mui/x-data-grid";
import type { Theme } from "@mui/material/styles";
import { lightSurfaces, slate } from "@/theme/appTokens";

/** Row heights per density; `standard` fits an avatar + two-line identity cell. */
export const ROW_HEIGHT = { standard: 56, dense: 44 } as const;
export const HEADER_HEIGHT = 44;

/** Pill-shaped 36px inputs for the toolbar (filters, search). */
export const pillControlSx = {
  "& .MuiInputBase-root": { borderRadius: 999, height: 36, fontSize: "0.875rem" },
  "& .MuiInputBase-input": { py: 0.75 },
  "& .MuiSelect-select": { py: 0.75, pr: "32px !important" },
};

/** Class on toolbar icon buttons (ToolbarButton takes no `sx`). */
export const TOOL_BUTTON = "data-table-tool";

export const toolbarIconButtonSx = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: 1,
  borderColor: "divider",
};

/** The "Clean SaaS" table: tinted header band, zebra rows, hover edge, compact footer. */
export const dataTableSx = (theme: Theme) => ({
  border: 0,
  borderRadius: 0,
  "--DataGrid-overlayHeight": "180px",
  "--DataGrid-rowBorderColor": (theme.vars || theme).palette.divider,
  "& .money-cell": { fontWeight: 500 },

  // Header band
  [`& .${gridClasses.columnHeader}`]: {
    px: 1.5,
    backgroundColor: (theme.vars || theme).palette.action.hover,
    "&:focus, &:focus-within": { outlineOffset: -2 },
  },
  [`& .${gridClasses.columnHeaderTitle}`]: {
    ...theme.typography.caption,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    color: (theme.vars || theme).palette.text.secondary,
  },
  // Keep the sort arrow beside its label (the template spreads them apart).
  // Right-aligned headers are row-reverse, so flex-start keeps them on the right.
  [`& .${gridClasses.columnHeaderTitleContainer}`]: { justifyContent: "flex-start", gap: 0.5 },
  [`& .${gridClasses.columnSeparator}`]: { display: "none" },

  // Rows
  [`& .${gridClasses.cell}`]: {
    px: 1.5,
    "&:focus, &:focus-within": { outlineOffset: -2 },
  },
  [`& .${gridClasses.row}`]: {
    transition: theme.transitions.create(["background-color", "box-shadow"], {
      duration: theme.transitions.duration.shortest,
    }),
    "&.odd": { backgroundColor: "rgba(15, 23, 42, 0.018)" },
    "&:hover": {
      backgroundColor: (theme.vars || theme).palette.action.hover,
      boxShadow: `inset 3px 0 0 ${(theme.vars || theme).palette.primary.main}`,
    },
    "&:last-of-type": { borderBottom: 0 },
  },

  // Footer
  [`& .${gridClasses.footerContainer}`]: { minHeight: 52, borderTopColor: (theme.vars || theme).palette.divider },

  ...theme.applyStyles("light", {
    backgroundColor: lightSurfaces.paper,
    [`& .${gridClasses.columnHeader}`]: { backgroundColor: slate[50] },
    [`& .${gridClasses.footerContainer}`]: { backgroundColor: lightSurfaces.paper },
    [`& .${gridClasses.row}`]: {
      "&.odd": { backgroundColor: "#FBFCFE" },
      "&:hover": { backgroundColor: slate[100] },
    },
  }),
  ...theme.applyStyles("dark", {
    [`& .${gridClasses.row}.odd`]: { backgroundColor: "rgba(255, 255, 255, 0.025)" },
  }),
});

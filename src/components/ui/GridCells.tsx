"use client";

import Stack, { type StackProps } from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TagPill } from "@/components/DataComponents";

/** Fills a Data Grid cell and centres its content vertically. */
export function GridCell({
  align = "start",
  direction = "row",
  spacing = 1,
  children,
}: {
  align?: "start" | "end";
  direction?: StackProps["direction"];
  spacing?: number;
  children: React.ReactNode;
}) {
  const column = direction === "column";
  return (
    <Stack
      direction={direction}
      spacing={spacing}
      sx={{
        height: "100%",
        minWidth: 0,
        // Row: vertically centre and align horizontally; column: the reverse.
        alignItems: column ? (align === "end" ? "flex-end" : "flex-start") : "center",
        justifyContent: column ? "center" : align === "end" ? "flex-end" : "flex-start",
      }}
    >
      {children}
    </Stack>
  );
}

/** "Commercial · Floor 2 #A-01" unit cell shared by the tenant grids. */
export function UnitCell({ unitType, unitLabel }: { unitType: string; unitLabel?: string | null }) {
  return (
    <GridCell>
      <TagPill label={unitType === "commercial" ? "Commercial" : "Residential"} />
      {unitLabel ? (
        <Typography variant="caption" color="textSecondary" noWrap>
          {unitLabel}
        </Typography>
      ) : null}
    </GridCell>
  );
}

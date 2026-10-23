"use client";

import Stack, { type StackProps } from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TagPill } from "@/components/ui/DataDisplay";
import { formatUnits, unitMixLabel, type UnitMix } from "@/lib/domain/tenant";

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

/** "Commercial · AC-T1-G01, G02" houses cell shared by the tenant grids. */
export function UnitCell({ unitMix, unitCodes }: { unitMix: UnitMix | null; unitCodes: string[] }) {
  const houses = formatUnits(unitCodes);
  return (
    <GridCell>
      <TagPill label={unitMixLabel(unitMix)} />
      {houses ? (
        <Typography variant="caption" color="textSecondary" noWrap title={houses}>
          {houses}
        </Typography>
      ) : null}
    </GridCell>
  );
}

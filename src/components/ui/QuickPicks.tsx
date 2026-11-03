"use client";

import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

export interface QuickPick {
  /** What the chip says. */
  label: string;
  /** Read out instead of the label, e.g. with the field name and the full value. */
  ariaLabel?: string;
  selected: boolean;
  /** Not pickable right now (a full list); a selected chip can always be tapped off. */
  disabled?: boolean;
}

/**
 * One-tap choices under a field (a date's "Today" / "Yesterday", the most
 * first tag suggestions): chips big enough to touch, the chosen ones filled. `onPick`
 * gets the index tapped; the field decides whether that selects, replaces
 * or toggles.
 */
export default function QuickPicks({
  picks,
  onPick,
  disabled,
}: {
  picks: QuickPick[];
  onPick: (index: number) => void;
  disabled?: boolean;
}) {
  if (picks.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      {picks.map((pick, index) => (
        <Chip
          key={pick.label}
          label={pick.label}
          clickable
          // 32px, and 36px on touch screens: these are meant to be tapped.
          sx={{ "@media (pointer: coarse)": { height: 36 } }}
          disabled={disabled || (pick.disabled && !pick.selected)}
          color={pick.selected ? "primary" : "default"}
          variant={pick.selected ? "filled" : "outlined"}
          aria-pressed={pick.selected}
          aria-label={pick.ariaLabel}
          onClick={() => onPick(index)}
        />
      ))}
    </Stack>
  );
}

"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

/** Vertical list of label/value rows, optionally separated by dividers. */
export function DetailList({ dividers = false, children }: { dividers?: boolean; children: React.ReactNode }) {
  return (
    <Stack spacing={1} divider={dividers ? <Divider flexItem /> : undefined}>
      {children}
    </Stack>
  );
}

/** Label on the left, value right-aligned; long values wrap instead of overflowing. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
      <Typography variant="body2" color="textSecondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ minWidth: 0, textAlign: "right", overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Label + money line for summaries. `strong` emphasises a subtotal,
 * `total` is the big headline figure (e.g. the receipt total).
 */
export function SummaryLine({
  label,
  value,
  emphasis = "default",
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: "default" | "strong" | "total";
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
      <Typography
        variant={emphasis === "total" ? "subtitle2" : "body2"}
        color={emphasis === "default" ? "textSecondary" : "textPrimary"}
      >
        {label}
      </Typography>
      <Typography
        variant={emphasis === "total" ? "h4" : emphasis === "strong" ? "subtitle2" : "body2"}
        component="p"
      >
        {value}
      </Typography>
    </Stack>
  );
}

/** A month (or other line) with a caption and a compact right-aligned amount input. */
export function AmountRow({
  label,
  caption,
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  label: string;
  caption?: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Screen-reader label for the input; defaults to "Amount for {label}". */
  ariaLabel?: string;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{label}</Typography>
        {caption ? (
          <Typography variant="caption" color="textSecondary" component="p">
            {caption}
          </Typography>
        ) : null}
      </Box>
      <TextField
        type="number"
        size="small"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        slotProps={{ htmlInput: { step: "0.01", min, max, "aria-label": ariaLabel ?? `Amount for ${label}` } }}
        sx={{ width: 130, flexShrink: 0, "& input": { textAlign: "right" } }}
      />
    </Stack>
  );
}

/** Wrapping row of badges/pills. */
export function BadgeRow({ align = "start", children }: { align?: "start" | "end"; children: React.ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap", justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      {children}
    </Stack>
  );
}

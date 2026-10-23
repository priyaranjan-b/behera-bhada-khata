"use client";

import { useId } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack, { type StackProps } from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The one card-with-a-heading used across forms, summaries and detail panels:
 * outlined Card, subtitle2 heading (+ optional caption/icon), an optional
 * right-aligned action, then the body with consistent spacing.
 */
export function SectionCard({
  title,
  caption,
  icon,
  action,
  sticky = false,
  fill = false,
  children,
}: {
  title: string;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  /** Right side of the heading row: a badge, a Clear button, a filter… */
  action?: React.ReactNode;
  /** Stick to the top of the viewport on desktop (side summaries). */
  sticky?: boolean;
  /** Stretch to the height of its grid row (cards side by side). */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <Card
      component="section"
      variant="outlined"
      aria-labelledby={headingId}
      sx={[sticky && { position: { md: "sticky" }, top: { md: 16 } }, fill && { height: "100%" }]}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            {icon ? (
              <Box
                component="span"
                aria-hidden
                sx={{ display: "inline-flex", color: "text.secondary", "& svg": { fontSize: "1.25rem" } }}
              >
                {icon}
              </Box>
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              <Typography id={headingId} component="h2" variant="subtitle2">
                {title}
              </Typography>
              {caption ? (
                <Typography variant="caption" color="textSecondary" component="p">
                  {caption}
                </Typography>
              ) : null}
            </Box>
          </Stack>
          {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}

/** Thin divider-bordered inset, e.g. the month switcher. */
export function InsetBox({ direction = "row", children }: { direction?: StackProps["direction"]; children: React.ReactNode }) {
  return (
    <Stack
      direction={direction}
      spacing={0.5}
      sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 0.5 }}
    >
      {children}
    </Stack>
  );
}

const TILE_SIZE = { sm: 40, md: 48 } as const;

/** Rounded square holding an icon (property cards, empty states, dropzones). */
export function IconTile({
  icon,
  size = "md",
  tone = "primary",
}: {
  icon: React.ReactNode;
  size?: keyof typeof TILE_SIZE;
  tone?: "primary" | "neutral";
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: TILE_SIZE[size],
        height: TILE_SIZE[size],
        flexShrink: 0,
        borderRadius: 1.5,
        display: "grid",
        placeItems: "center",
        border: "1px solid",
        borderColor: "divider",
        color: tone === "primary" ? "primary.main" : "text.secondary",
      }}
    >
      {icon}
    </Box>
  );
}

/** Dashed call-to-action card for file uploads. */
export function DropzoneCard({
  icon,
  title,
  description,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ borderStyle: "dashed", borderWidth: 2, py: 4 }}>
      <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center" }}>
        <IconTile icon={icon} />
        <Typography component="h2" variant="subtitle2">
          {title}
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 520 }}>
          {description}
        </Typography>
        <Box sx={{ pt: 1, width: { xs: "100%", sm: "auto" } }}>{actions}</Box>
      </Stack>
    </Card>
  );
}

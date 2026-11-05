"use client";

import { useId, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import AppCard from "@/components/ui/AppCard";
import Stack, { type StackProps } from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { toneTintSx, type Tone } from "./tone";

/**
 * The one card-with-a-heading used across forms, summaries and detail panels:
 * outlined Card, subtitle2 heading (+ optional caption/icon), an optional
 * right-aligned action, then the body with consistent spacing. With a
 * `tone`, the icon sits in a tinted tile in that colour (Profile, Settings).
 */
export function SectionCard({
  title,
  caption,
  icon,
  tone,
  action,
  sticky = false,
  fill = false,
  collapseOnPhone = false,
  children,
}: {
  title: string;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  /** Draws `icon` in a tinted tile of this colour instead of a plain grey glyph. */
  tone?: Tone;
  /** Right side of the heading row: a badge, a Clear button, a filter… */
  action?: React.ReactNode;
  /** Stick to the top of the viewport on desktop (side summaries). */
  sticky?: boolean;
  /** Stretch to the height of its grid row (cards side by side). */
  fill?: boolean;
  /**
   * On phones, start as just the heading with a chevron that opens the body
   * (reference cards a long page can do without, e.g. the Overview's). Done
   * in CSS, so the server's page already has it closed: no jump on load.
   */
  collapseOnPhone?: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  // Hidden only below `sm`; from `sm` up a collapsible card is an ordinary one.
  const phoneHidden = collapseOnPhone && !open ? { display: { xs: "none", sm: "block" } } : undefined;
  return (
    <AppCard
      component="section"
      aria-labelledby={headingId}
      sx={[sticky && { position: { md: "sticky" }, top: { md: 16 } }, fill && { height: "100%" }]}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={tone ? 1.5 : 1} sx={{ alignItems: "center", minWidth: 0 }}>
            {icon && tone ? (
              <IconTile icon={icon} tone={tone} look="tinted" size="compact" />
            ) : icon ? (
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
          {action ? <Box sx={[{ flexShrink: 0 }, phoneHidden ?? {}]}>{action}</Box> : null}
          {collapseOnPhone ? (
            <IconButton
              aria-label={`${open ? "Hide" : "Show"} ${title}`}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
              sx={{ display: { xs: "inline-flex", sm: "none" }, flexShrink: 0 }}
            >
              <ExpandMoreRoundedIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </IconButton>
          ) : null}
        </Stack>
        {collapseOnPhone ? (
          <Box id={bodyId} sx={phoneHidden}>
            {children}
          </Box>
        ) : (
          children
        )}
      </Stack>
    </AppCard>
  );
}

/** Thin divider-bordered inset, e.g. the month switcher. */
export function InsetBox({
  direction = "row",
  fill = false,
  children,
}: {
  direction?: StackProps["direction"];
  /** As wide as its container (a phone's period switcher), instead of its content. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack
      direction={direction}
      spacing={0.5}
      sx={{ alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 0.5, width: fill ? "100%" : undefined }}
    >
      {children}
    </Stack>
  );
}

const TILE_SIZE = { compact: { xs: 32, sm: 40 }, sm: 40, md: 48 } as const;

/**
 * Rounded square holding an icon (property cards, empty states, dropzones).
 * `outlined` (default) is a bordered tile in primary or neutral; `tinted`
 * fills it softly in any `Tone` (stat cards). `compact` is 32px on phones.
 */
export function IconTile({
  icon,
  size = "md",
  tone = "primary",
  look = "outlined",
}: {
  icon: React.ReactNode;
  size?: keyof typeof TILE_SIZE;
  tone?: Tone;
  look?: "outlined" | "tinted";
}) {
  return (
    <Box
      aria-hidden
      sx={[
        {
          width: TILE_SIZE[size],
          height: TILE_SIZE[size],
          flexShrink: 0,
          borderRadius: 1.5,
          display: "grid",
          placeItems: "center",
          "& .MuiSvgIcon-root": size === "compact" ? { fontSize: { xs: 18, sm: 22 } } : {},
        },
        look === "tinted"
          ? (theme) => toneTintSx(theme, tone)
          : { border: "1px solid", borderColor: "divider", color: tone === "neutral" ? "text.secondary" : "primary.main" },
      ]}
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
    <AppCard depth="flat" sx={{ borderStyle: "dashed", borderWidth: 2, py: 4 }}>
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
    </AppCard>
  );
}

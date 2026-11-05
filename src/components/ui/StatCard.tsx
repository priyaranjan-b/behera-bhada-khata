"use client";

import { useId } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import AppCard from "@/components/ui/AppCard";
import ButtonBase from "@mui/material/ButtonBase";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { lineClasses } from "@mui/x-charts/LineChart";
import { StatusBadge, type BadgeTone } from "@/components/ui/DataDisplay";
import { IconTile } from "@/components/ui/Surfaces";
import { toneMain, type Tone } from "@/components/ui/tone";
import { formatMoney } from "@/lib/money";

export type Trend = "up" | "down" | "neutral";

/** At most `lines` lines per breakpoint, then an ellipsis; "none" lets the text wrap. */
function clampLines(lines: { xs: number; sm: number | "none" }) {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: { xs: lines.xs, sm: lines.sm },
    overflow: { xs: "hidden", sm: lines.sm === "none" ? "visible" : "hidden" },
  } as const;
}

function AreaGradient({ color, id }: { color: string; id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

/**
 * One figure on a card: title and a tone-tinted icon on top, the value (with
 * an optional badge), captions pinned to the bottom so cards in a row line
 * up, and a sparkline only when one is given.
 *
 * - `tone` colours the icon tile, the accent bar and the wash; left out, it
 *   follows the badge (neutral without one). The value keeps the text colour.
 * - `variant`: `highlighted` adds a tone bar down the left edge (needs
 *   attention; a danger card also shows the value in red), `gradient` a
 *   faint tone wash (the page's headline figure).
 * - Compact on phones, where pages lay them out two per row or in a swipe
 *   row (`StatCardRow`): less padding, a title of two lines at most, a 32px icon, a
 *   smaller value with the badge under it, a caption of two lines at most
 *   and no sparkline.
 */
export default function StatCard({
  title,
  value,
  caption,
  note,
  badge,
  sparkline,
  href,
  onClick,
  selected = false,
  icon,
  tone,
  variant = "default",
}: {
  title: string;
  value: string;
  caption?: string;
  /** A second caption line, e.g. a related figure that differs from `value`. */
  note?: string;
  badge?: { label: string; tone: BadgeTone };
  // `format` is a key, not a function, because Server Components render this.
  sparkline?: { data: number[]; labels: string[]; trend: Trend; format?: "money" };
  /** Makes the whole card a link (it lifts on hover), e.g. to a pre-filtered list. */
  href?: string;
  /**
   * Makes the whole card a toggle button instead, e.g. filtering the table
   * below it to what it counts (A28); `selected` while that filter is on
   * (`aria-pressed`, and an outline). Client components only.
   */
  onClick?: () => void;
  selected?: boolean;
  /** Decorative icon in the top-right tile, e.g. `<ReceiptLongRoundedIcon />`. */
  icon?: React.ReactNode;
  tone?: Tone;
  variant?: "default" | "highlighted" | "gradient";
}) {
  const theme = useTheme();
  const gradientId = useId().replace(/:/g, "");
  const cardTone: Tone = tone ?? badge?.tone ?? "neutral";
  // theme.vars resolve to CSS variables, so the line follows light/dark mode.
  const palette = (theme.vars || theme).palette;
  const chartColor = sparkline
    ? { up: palette.success.main, down: palette.error.main, neutral: palette.grey[400] }[sparkline.trend]
    : undefined;

  return (
    <AppCard
      href={href}
      {...(onClick && !href
        ? { component: ButtonBase, onClick, interactive: true, "aria-pressed": selected, focusRipple: true }
        : {})}
      // A selected link card (its filter is the page's current view) says so to screen readers.
      {...(href && selected ? { "aria-current": "true" } : {})}
      // The page's headline figure: StatCardRow shows it first on phones (A26).
      {...(variant === "gradient" ? { "data-emphasis": "" } : {})}
      sx={[
        // Phones: 12px in, not the card's 16, so a row of figures stays short.
        { height: "100%", flexGrow: 1, position: "relative", p: { xs: 1.5, sm: 2 } },
        // A card that's a button reads and lays out like the others (ButtonBase centres inline content).
        Boolean(onClick && !href) && { display: "block", width: "100%", textAlign: "left" },
        selected && { outline: "2px solid", outlineColor: toneMain(theme, "primary"), outlineOffset: -2 },
        variant === "highlighted" && {
          "&::before": { content: '""', position: "absolute", inset: "0 auto 0 0", width: 3, bgcolor: toneMain(theme, cardTone) },
        },
        // Light mode: a faint glow of the tone from the icon's corner, so a white
        // card isn't blank (the dark card needs none).
        variant !== "gradient" &&
          theme.applyStyles("light", {
            backgroundImage: `radial-gradient(circle at 100% 0%, color-mix(in srgb, ${toneMain(theme, cardTone)} 10%, transparent), transparent 60%)`,
          }),
        variant === "gradient" && {
          // Over the card's own background, so both schemes keep their surface.
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${toneMain(theme, cardTone)} 18%, transparent) 0%, transparent 75%)`,
          ...theme.applyStyles("light", {
            backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${toneMain(theme, cardTone)} 22%, transparent) 0%, transparent 80%)`,
          }),
        },
      ]}
    >
      <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column", gap: { xs: 0.5, sm: 1 } }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Typography
            component="h2"
            variant="subtitle2"
            color="textSecondary"
            // Two lines at most: narrow cards (seven in a row, a phone's swipe row) keep the words the figure depends on.
            sx={{ fontWeight: 600, minWidth: 0, pt: 0.5, ...clampLines({ xs: 2, sm: 2 }) }}
          >
            {title}
          </Typography>
          {icon ? <IconTile icon={icon} tone={cardTone} look="tinted" size="compact" /> : null}
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          // The badge wraps under the value rather than cutting the figure short.
          sx={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: { xs: 0.5, sm: 1 } }}
        >
          <Typography
            variant="h4"
            component="p"
            noWrap
            sx={{
              typography: { xs: "h6", sm: "h4" },
              fontWeight: 700,
              maxWidth: "100%",
              flexShrink: 0,
              color: variant === "highlighted" && cardTone === "danger" ? "error.main" : "text.primary",
            }}
          >
            {value}
          </Typography>
          {badge && <StatusBadge tone={badge.tone} label={badge.label} />}
        </Stack>
        {caption || note ? (
          <Stack sx={{ mt: "auto" }}>
            {caption && (
              <Typography variant="caption" color="textSecondary" title={caption} sx={clampLines({ xs: 2, sm: "none" })}>
                {caption}
              </Typography>
            )}
            {note && (
              <Typography variant="caption" color="textSecondary" title={note} sx={clampLines({ xs: 1, sm: "none" })}>
                {note}
              </Typography>
            )}
          </Stack>
        ) : null}
        {sparkline && chartColor && (
          <Box sx={{ width: "100%", height: 50, display: { xs: "none", sm: "block" } }}>
            <SparkLineChart
              color={chartColor}
              data={sparkline.data}
              area
              showHighlight
              showTooltip
              valueFormatter={(v) => (v == null ? "" : sparkline.format === "money" ? formatMoney(v) : String(v))}
              xAxis={{ scaleType: "band", data: sparkline.labels }}
              sx={{ [`& .${lineClasses.area}`]: { fill: `url(#${gradientId})` } }}
            >
              <AreaGradient color={chartColor} id={gradientId} />
            </SparkLineChart>
          </Box>
        )}
      </CardContent>
    </AppCard>
  );
}

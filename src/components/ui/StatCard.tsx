"use client";

import { useId } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { lineClasses } from "@mui/x-charts/LineChart";
import { StatusBadge, type BadgeTone } from "@/components/ui/DataDisplay";
import { formatMoney } from "@/lib/money";

export type Trend = "up" | "down" | "neutral";

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

/** Template StatCard: title, big value, a badge, and an optional sparkline. */
export default function StatCard({
  title,
  value,
  caption,
  badge,
  sparkline,
}: {
  title: string;
  value: string;
  caption?: string;
  badge?: { label: string; tone: BadgeTone };
  // `format` is a key, not a function, because Server Components render this.
  sparkline?: { data: number[]; labels: string[]; trend: Trend; format?: "money" };
}) {
  const theme = useTheme();
  const gradientId = useId().replace(/:/g, "");
  // theme.vars resolve to CSS variables, so the line follows light/dark mode.
  const palette = (theme.vars || theme).palette;
  const chartColor = sparkline
    ? { up: palette.success.main, down: palette.error.main, neutral: palette.grey[400] }[sparkline.trend]
    : undefined;

  return (
    <Card variant="outlined" sx={{ height: "100%", flexGrow: 1 }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        <Stack sx={{ justifyContent: "space-between", flexGrow: 1, gap: 1 }}>
          <Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography variant="h4" component="p" noWrap>
                {value}
              </Typography>
              {badge && <StatusBadge tone={badge.tone} label={badge.label} />}
            </Stack>
            {caption && (
              <Typography variant="caption" color="textSecondary">
                {caption}
              </Typography>
            )}
          </Stack>
          <Box sx={{ width: "100%", height: 50 }}>
            {sparkline && chartColor && (
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
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import type { MonthlyTrendPoint } from "@/lib/reports";
import { formatMoney } from "@/lib/money";

// Validated against the app's chart surface (#FFFFFF) with
// dataviz/scripts/validate_palette.js: worst-pair CVD deltaE 28.0, normal
// vision 32.9 - well clear of the safety floors.
const BILLED_COLOR = "#4338CA";
const COLLECTED_COLOR = "#2e7d32";

const GRIDLINE = "#e1e0d9";
const AXIS_MUTED = "#898781";
const BASELINE = "#c3c2b7";

const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 64 };

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

interface HoverInfo {
  x: number;
  y: number;
  point: MonthlyTrendPoint;
  series: "billed" | "collected";
}

export default function BillingCollectionChart({ data }: { data: MonthlyTrendPoint[] }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (data.length === 0) return null;

  const allValues = data.flatMap((d) => [d.billed, d.collected]);
  const rawMax = Math.max(0, ...allValues);
  const rawMin = Math.min(0, ...allValues);
  const yMax = niceMax(rawMax);
  const yMin = rawMin < 0 ? -niceMax(-rawMin) : 0;

  const chartWidth = WIDTH - MARGIN.left - MARGIN.right;
  const chartHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const yScale = (v: number) => MARGIN.top + chartHeight * (1 - (v - yMin) / (yMax - yMin));
  const zeroY = yScale(0);

  const groupWidth = chartWidth / data.length;
  const barWidth = Math.min(24, groupWidth / 2 - 6);
  const gap = 2;
  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / tickCount);

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Billing vs collection
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Cash actually collected each month vs. what was billed - last {data.length} months
          </Typography>
        </Box>
        <Button size="small" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Hide table" : "View as table"}
        </Button>
      </Stack>

      <Stack direction="row" spacing={2.5} sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: BILLED_COLOR }} />
          <Typography variant="caption" color="textSecondary">
            Billed
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: COLLECTED_COLOR }} />
          <Typography variant="caption" color="textSecondary">
            Collected
          </Typography>
        </Stack>
      </Stack>

      <Box sx={{ position: "relative" }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {tickValues.map((tv) => (
            <g key={tv}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yScale(tv)}
                y2={yScale(tv)}
                stroke={GRIDLINE}
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={yScale(tv)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill={AXIS_MUTED}
              >
                {compactMoney(tv)}
              </text>
            </g>
          ))}
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} stroke={BASELINE} strokeWidth={1} />

          {data.map((d, i) => {
            const groupX = MARGIN.left + i * groupWidth;
            const centerX = groupX + groupWidth / 2;
            const billedX = centerX - barWidth - gap / 2;
            const collectedX = centerX + gap / 2;
            const billedTop = Math.min(yScale(d.billed), zeroY);
            const billedH = Math.max(Math.abs(yScale(d.billed) - zeroY), 1);
            const collectedTop = Math.min(yScale(d.collected), zeroY);
            const collectedH = Math.max(Math.abs(yScale(d.collected) - zeroY), 1);
            const isHoveredGroup = hover?.point.monthKey === d.monthKey;

            return (
              <g key={d.monthKey}>
                <rect
                  x={billedX}
                  y={billedTop}
                  width={barWidth}
                  height={billedH}
                  rx={4}
                  fill={BILLED_COLOR}
                  opacity={isHoveredGroup && hover?.series !== "billed" ? 0.55 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover({ x: billedX + barWidth / 2, y: billedTop, point: d, series: "billed" })}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover({ x: billedX + barWidth / 2, y: billedTop, point: d, series: "billed" })}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                />
                <rect
                  x={collectedX}
                  y={collectedTop}
                  width={barWidth}
                  height={collectedH}
                  rx={4}
                  fill={COLLECTED_COLOR}
                  opacity={isHoveredGroup && hover?.series !== "collected" ? 0.55 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    setHover({ x: collectedX + barWidth / 2, y: collectedTop, point: d, series: "collected" })
                  }
                  onMouseLeave={() => setHover(null)}
                  onFocus={() =>
                    setHover({ x: collectedX + barWidth / 2, y: collectedTop, point: d, series: "collected" })
                  }
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                />
                <text x={centerX} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle" fontSize={11} fill={AXIS_MUTED}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hover ? (
          <Box
            sx={{
              position: "absolute",
              left: `${(hover.x / WIDTH) * 100}%`,
              top: `${(hover.y / HEIGHT) * 100}%`,
              transform: "translate(-50%, -100%)",
              mt: -1,
              bgcolor: "grey.900",
              color: "common.white",
              borderRadius: 1,
              px: 1.25,
              py: 0.75,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: 3,
              zIndex: 1,
            }}
          >
            <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
              {hover.point.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Billed: {formatMoney(hover.point.billed)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Collected: {formatMoney(hover.point.collected)}
            </Typography>
          </Box>
        ) : null}
      </Box>

      {showTable ? (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Month</TableCell>
              <TableCell align="right">Billed</TableCell>
              <TableCell align="right">Collected</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.monthKey}>
                <TableCell>{d.label}</TableCell>
                <TableCell align="right">{formatMoney(d.billed)}</TableCell>
                <TableCell align="right">{formatMoney(d.collected)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </Paper>
  );
}

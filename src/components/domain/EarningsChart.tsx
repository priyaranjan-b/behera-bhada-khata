"use client";

import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import AppCard from "@/components/ui/AppCard";
import { APP_LOCALE } from "@/lib/dates";
import type { EarningsMonth } from "@/lib/domain/earnings";
import { formatMoney } from "@/lib/money";

const compact = new Intl.NumberFormat(APP_LOCALE, { notation: "compact", maximumFractionDigits: 1 });

type View = "rent" | "cash";

/** The two nets (A23): each month's income, maintenance and what was left, by rent month or as cash. */
const VIEWS: Record<View, { label: string; caption: string; income: keyof EarningsMonth; spent: keyof EarningsMonth; net: keyof EarningsMonth; incomeLabel: string }> = {
  rent: {
    label: "Rent month",
    caption: "Rent collected for each month, less everything spent on the houses that month",
    income: "collected",
    spent: "maintenance",
    net: "netCollected",
    incomeLabel: "Collected",
  },
  cash: {
    label: "Cash",
    caption: "Cash received in each month, less maintenance paid in cash (set-offs left out of both)",
    income: "received",
    spent: "maintenanceCash",
    net: "netCash",
    incomeLabel: "Received",
  },
};

/** Income, maintenance and net per month, by rent month or as cash. */
export default function EarningsChart({ months }: { months: EarningsMonth[] }) {
  const theme = useTheme();
  const [view, setView] = useState<View>("rent");
  const palette = (theme.vars || theme).palette;
  const v = VIEWS[view];
  const series = (key: keyof EarningsMonth) => months.map((m) => Number(m[key]));

  return (
    <AppCard sx={{ width: "100%" }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Stack>
            <Typography component="h2" variant="subtitle2">
              Earnings by month
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {v.caption}
            </Typography>
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_e, next: View | null) => next && setView(next)}
            aria-label="Count by"
          >
            {(Object.keys(VIEWS) as View[]).map((key) => (
              <ToggleButton key={key} value={key}>
                {VIEWS[key].label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        <BarChart
          borderRadius={6}
          xAxis={[{ scaleType: "band", categoryGapRatio: 0.35, barGapRatio: 0.15, data: months.map((m) => m.label), height: 24 }]}
          yAxis={[{ width: 56, valueFormatter: (n: number) => compact.format(n) }]}
          series={[
            { id: "income", label: v.incomeLabel, data: series(v.income), color: palette.primary.main, valueFormatter: (n) => formatMoney(n ?? 0) },
            { id: "spent", label: "Maintenance", data: series(v.spent), color: palette.warning.main, valueFormatter: (n) => formatMoney(n ?? 0) },
            { id: "net", label: "Net", data: series(v.net), color: palette.success.main, valueFormatter: (n) => formatMoney(n ?? 0) },
          ]}
          height={280}
          margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
          grid={{ horizontal: true }}
          slotProps={{ legend: { position: { vertical: "top", horizontal: "end" } } }}
        />
      </CardContent>
    </AppCard>
  );
}

"use client";

import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import type { MonthlyTrendPoint } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { StatusBadge } from "@/components/DataComponents";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** Billed vs collected per month (template PageViewsBarChart look), with a table view for screen readers. */
export default function BillingCollectionChart({ data }: { data: MonthlyTrendPoint[] }) {
  const theme = useTheme();
  const [showTable, setShowTable] = useState(false);
  if (data.length === 0) return null;

  const palette = (theme.vars || theme).palette;
  const totalBilled = data.reduce((sum, d) => sum + d.billed, 0);
  const totalCollected = data.reduce((sum, d) => sum + d.collected, 0);
  const rate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : null;

  return (
    <Card variant="outlined" sx={{ width: "100%" }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Typography component="h2" variant="subtitle2" gutterBottom>
            Billing vs collection
          </Typography>
          <Button size="small" variant="text" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? "Show chart" : "View as table"}
          </Button>
        </Stack>
        <Stack>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography variant="h4" component="p">
              {formatMoney(totalCollected)}
            </Typography>
            {rate !== null && (
              <StatusBadge tone={rate >= 90 ? "success" : rate >= 60 ? "warning" : "danger"} label={`${rate}% collected`} />
            )}
          </Stack>
          <Typography variant="caption" color="textSecondary">
            Cash collected vs. billed, last {data.length} months
          </Typography>
        </Stack>

        {showTable ? (
          <Table size="small" sx={{ mt: 2 }} aria-label="Billing vs collection by month">
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
        ) : (
          <BarChart
            borderRadius={6}
            xAxis={[{ scaleType: "band", categoryGapRatio: 0.45, barGapRatio: 0.15, data: data.map((d) => d.label), height: 24 }]}
            yAxis={[{ width: 56, valueFormatter: (v: number) => compact.format(v) }]}
            series={[
              { id: "billed", label: "Billed", data: data.map((d) => d.billed), color: palette.primary.main, valueFormatter: (v) => formatMoney(v ?? 0) },
              { id: "collected", label: "Collected", data: data.map((d) => d.collected), color: palette.success.main, valueFormatter: (v) => formatMoney(v ?? 0) },
            ]}
            height={260}
            margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
            grid={{ horizontal: true }}
            slotProps={{ legend: { position: { vertical: "top", horizontal: "end" } } }}
          />
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import AppCard from "@/components/ui/AppCard";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import type { MonthlyTrendPoint } from "@/lib/domain/reports";
import { collectionRateTone } from "@/lib/domain/overview";
import { APP_LOCALE } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { StatusBadge } from "@/components/ui/DataDisplay";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { useAppRouter } from "@/components/ui/Loading";
import TextLink from "@/components/ui/TextLink";
import { routes } from "@/lib/routes";
import { paidDirectQuery } from "@/lib/preferences";
import type { PaidDirectView } from "@/lib/types";
import { TREND_CHART_HEIGHT } from "@/components/ui/chartHeights";

const compact = new Intl.NumberFormat(APP_LOCALE, { notation: "compact", maximumFractionDigits: 1 });

/** The Billing page for one month of the chart (`monthKey` is yyyy-MM, as the trend's points), paid direct as the chart has it. */
const monthBillingHref = (monthKey: string, paidDirect: PaidDirectView) =>
  routes.billing({ from: monthKey, to: monthKey, ...paidDirectQuery(paidDirect) });

/**
 * Billed vs collected per month (template PageViewsBarChart look), with a
 * table view for screen readers. A month's bars, or its row in the table,
 * open the Billing page for that month.
 */
export default function BillingCollectionChart({
  data,
  href,
  paidDirect = "hide",
}: {
  data: MonthlyTrendPoint[];
  /** The Billing page for the same months. */
  href?: string;
  /** "Include Govt paid direct" as the chart's figures have it, carried into its month links. */
  paidDirect?: PaidDirectView;
}) {
  const theme = useTheme();
  const router = useAppRouter();
  const [showTable, setShowTable] = useState(false);
  if (data.length === 0) return null;

  const palette = (theme.vars || theme).palette;
  const totalBilled = data.reduce((sum, d) => sum + d.billed, 0);
  const totalCollected = data.reduce((sum, d) => sum + d.collected, 0);
  const rate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : null;

  return (
    <AppCard sx={{ width: "100%" }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Typography component="h2" variant="subtitle2" gutterBottom>
            Billing vs Received
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="text" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? "Show chart" : "View as table"}
            </Button>
            {href ? (
              <LinkButton href={href} size="small" variant="text">
                Open billing
              </LinkButton>
            ) : null}
          </Stack>
        </Stack>
        <Stack>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography variant="h4" component="p">
              {formatMoney(totalCollected)}
            </Typography>
            {rate !== null && (
              <StatusBadge tone={collectionRateTone(rate)} label={`${rate}% received`} />
            )}
          </Stack>
          <Typography variant="caption" color="textSecondary">
            Cash received (by payment date, incl. corrections) vs. billed, last {data.length} months
          </Typography>
        </Stack>

        {showTable ? (
          <Table size="small" sx={{ mt: 2 }} aria-label="Billing vs Received by month">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Billed</TableCell>
                <TableCell align="right">Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.monthKey}>
                  <TableCell>
                    <TextLink href={monthBillingHref(d.monthKey, paidDirect)} aria-label={`Billing for ${d.label}`}>
                      {d.label}
                    </TextLink>
                  </TableCell>
                  <TableCell align="right">{formatMoney(d.billed)}</TableCell>
                  <TableCell align="right">{formatMoney(d.collected)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          // Sized in CSS, not by a width check in JS, so a phone gets 180px from the first paint (no jump; A26).
          <Box sx={{ height: TREND_CHART_HEIGHT }}>
            <BarChart
              borderRadius={6}
              xAxis={[{ scaleType: "band", categoryGapRatio: 0.45, barGapRatio: 0.15, data: data.map((d) => d.label), height: 24 }]}
              yAxis={[{ width: 56, valueFormatter: (v: number) => compact.format(v) }]}
              series={[
                { id: "billed", label: "Billed", data: data.map((d) => d.billed), color: palette.primary.main, valueFormatter: (v) => formatMoney(v ?? 0) },
                { id: "collected", label: "Received", data: data.map((d) => d.collected), color: palette.success.main, valueFormatter: (v) => formatMoney(v ?? 0) },
              ]}
              margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
              grid={{ horizontal: true }}
              // A month's bars open its Billing page (the table view links each month for keyboards). On a
              // touch screen a tap is how the tooltip opens, so there it stays a tap: "Open billing" and the
              // table view's months are the way through.
              onAxisClick={(_event, item) => {
                if (window.matchMedia("(pointer: coarse)").matches) return;
                const point = item ? data[item.dataIndex] : undefined;
                if (point) router.push(monthBillingHref(point.monthKey, paidDirect));
              }}
              sx={{ cursor: { md: "pointer" } }}
              slotProps={{ legend: { position: { vertical: "top", horizontal: "end" } } }}
            />
          </Box>
        )}
      </CardContent>
    </AppCard>
  );
}

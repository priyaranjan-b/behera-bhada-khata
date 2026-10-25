"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { PieChart } from "@mui/x-charts/PieChart";
import { SectionCard } from "@/components/ui";
import type { KindBreakdown } from "@/lib/domain/overview";
import { formatMoney } from "@/lib/money";
import { chartCategorical } from "@/theme/appTokens";

// One CSS variable per tenant type, stepped separately for dark mode, so the
// same type keeps its colour in every donut and in the legend.
const seriesVar = (i: number) => `var(--tenant-kind-${i})`;
const seriesVars = (colors: readonly string[]) =>
  Object.fromEntries(colors.map((c, i) => [`--tenant-kind-${i}`, c]));

type Measure = { key: string; title: string; value: (k: KindBreakdown) => number; format: (v: number) => string };

const count = (v: number) => String(v);

function Donut({ kinds, measure }: { kinds: KindBreakdown[]; measure: Measure }) {
  const total = kinds.reduce((sum, k) => sum + measure.value(k), 0);
  return (
    <Stack spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
      <Typography variant="body2" color="textSecondary">
        {measure.title}
      </Typography>
      {total > 0 ? (
        <PieChart
          series={[
            {
              data: kinds.map((k, i) => ({ id: k.kind, value: measure.value(k), label: k.label, color: seriesVar(i) })),
              innerRadius: 44,
              outerRadius: 72,
              paddingAngle: 2,
              cornerRadius: 4,
              valueFormatter: (item) => measure.format(item.value),
            },
          ]}
          width={160}
          height={160}
          hideLegend
          margin={{ top: 4, bottom: 4, left: 4, right: 4 }}
        />
      ) : (
        <Box sx={{ height: 160, display: "grid", placeItems: "center" }}>
          <Typography variant="body2" color="textSecondary">
            None
          </Typography>
        </Box>
      )}
      <Typography variant="subtitle2">{measure.format(total)}</Typography>
    </Stack>
  );
}

/**
 * Tenants, this month's billing and arrears split by tenant type (individual,
 * business, government): three donuts sharing one colour per type, a legend,
 * and a table view with the exact numbers.
 */
export default function TenantTypesCard({ kinds, monthLabel }: { kinds: KindBreakdown[]; monthLabel: string }) {
  const [showTable, setShowTable] = useState(false);
  const measures: Measure[] = [
    { key: "tenants", title: "Tenants", value: (k) => k.tenants, format: count },
    { key: "billed", title: `Billed, ${monthLabel}`, value: (k) => k.expected, format: formatMoney },
    { key: "arrears", title: "Arrears", value: (k) => k.outstanding, format: formatMoney },
  ];
  const paidDirect = kinds.reduce((sum, k) => sum + k.paidDirectRent, 0);

  return (
    <Box
      sx={(theme) => ({
        height: "100%",
        ...seriesVars(chartCategorical.light),
        ...theme.applyStyles("dark", seriesVars(chartCategorical.dark)),
      })}
    >
      <SectionCard
        title="Tenant types"
        caption={
          paidDirect > 0 ? `Government rent paid to you directly (not tracked): ${formatMoney(paidDirect)} / month` : undefined
        }
        action={
          <Button size="small" variant="text" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? "Show charts" : "View as table"}
          </Button>
        }
        fill
      >
        {showTable ? (
          <Table size="small" aria-label="Tenants, billing and arrears by tenant type">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell align="right">Tenants</TableCell>
                <TableCell align="right">Billed</TableCell>
                <TableCell align="right">Collected</TableCell>
                <TableCell align="right">Arrears</TableCell>
                <TableCell align="right">Behind</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {kinds.map((k) => (
                <TableRow key={k.kind}>
                  <TableCell>{k.label}</TableCell>
                  <TableCell align="right">{k.tenants}</TableCell>
                  <TableCell align="right">{formatMoney(k.expected)}</TableCell>
                  <TableCell align="right">{formatMoney(k.collected)}</TableCell>
                  <TableCell align="right">{formatMoney(k.outstanding)}</TableCell>
                  <TableCell align="right">{k.overdueTenants}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Stack spacing={2}>
            <Grid container spacing={1} columns={12}>
              {measures.map((m) => (
                <Grid key={m.key} size={{ xs: 12, sm: 4 }} sx={{ minWidth: 0 }}>
                  <Donut kinds={kinds} measure={m} />
                </Grid>
              ))}
            </Grid>
            {/* Legend: identity never rests on colour alone. */}
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "center" }}>
              {kinds.map((k, i) => (
                <Stack key={k.kind} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: seriesVar(i) }} />
                  <Typography variant="body2">
                    {k.label}
                    <Typography component="span" variant="body2" color="textSecondary">
                      {` · ${k.tenants} · ${k.overdueTenants} behind`}
                    </Typography>
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}
      </SectionCard>
    </Box>
  );
}

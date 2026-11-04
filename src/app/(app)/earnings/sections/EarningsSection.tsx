import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import type { EarningsView } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";
import EarningsChart from "@/components/domain/EarningsChart";
import EarningsTable from "../EarningsTable";
import { EARNINGS_STAT_CELL } from "../earningsStatCell";

/** The two nets as cards, then the months as a chart and a table: one call, the same months (A23). */
export default async function EarningsSection({ earnings, rangeLabel }: { earnings: Promise<EarningsView>; rangeLabel: string }) {
  const { months, totals: t } = await earnings;
  const bySetOff = t.maintenance - t.maintenanceCash;
  return (
    <Stack spacing={2}>
      <Grid container spacing={2} columns={12}>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard title="Collected" value={formatMoney(t.collected)} caption={`Rent for these months, of ${formatMoney(t.billed)} billed`} />
        </Grid>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard title="Received" value={formatMoney(t.received)} caption="Cash that came in these months" />
        </Grid>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard
            title="Maintenance"
            value={formatMoney(t.maintenance)}
            caption={bySetOff > 0 ? `${formatMoney(t.maintenanceCash)} in cash · ${formatMoney(bySetOff)} by set-off` : "Spent on the houses"}
          />
        </Grid>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard
            title="Net (rent month)"
            value={formatMoney(t.netCollected)}
            caption="Collected − maintenance"
            badge={t.netCollected < 0 ? { label: "Loss", tone: "danger" } : undefined}
          />
        </Grid>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard
            title="Net cash"
            value={formatMoney(t.netCash)}
            caption="Received − maintenance paid in cash"
            badge={t.netCash < 0 ? { label: "Loss", tone: "danger" } : undefined}
          />
        </Grid>
        <Grid size={EARNINGS_STAT_CELL}>
          <StatCard
            title="Spent of collected"
            value={t.expenseRatio === null ? "—" : `${t.expenseRatio}%`}
            caption="Maintenance ÷ rent collected"
          />
        </Grid>
      </Grid>
      <EarningsChart months={months} />
      <EarningsTable months={months} rangeLabel={rangeLabel} />
    </Stack>
  );
}

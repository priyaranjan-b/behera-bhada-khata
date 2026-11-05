import Stack from "@mui/material/Stack";
import type { EarningsView } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import StatCard from "@/components/ui/StatCard";
import EarningsChart from "@/components/domain/EarningsChart";
import EarningsTable from "../EarningsTable";
import { EARNINGS_STAT_COLUMNS } from "../earningsStatColumns";
import StatCardRow from "@/components/ui/StatCardRow";

/** A net's icon and colour: green and rising, or red, falling and marked when it's a loss. */
function netLook(net: number, profitVariant: "default" | "gradient" = "default") {
  return net < 0
    ? { icon: <TrendingDownRoundedIcon />, tone: "danger" as const, variant: "highlighted" as const }
    : { icon: <TrendingUpRoundedIcon />, tone: "success" as const, variant: profitVariant };
}

/** The two nets as cards, then the months as a chart and a table: one call, the same months (A23). */
export default async function EarningsSection({
  earnings,
  rangeLabel,
  links,
}: {
  earnings: Promise<EarningsView>;
  rangeLabel: string;
  /** Where each figure comes from, for the same months: Billing, Payments and Maintenance. The nets are computed. */
  links: { collected: string; received: string; maintenance: string };
}) {
  const { months, totals: t } = await earnings;
  const bySetOff = t.maintenance - t.maintenanceCash;
  return (
    <Stack spacing={2}>
      <StatCardRow columns={EARNINGS_STAT_COLUMNS} label="Earnings totals">
        <StatCard
          title="Collected"
          icon={<SavingsRoundedIcon />}
          tone="primary"
          value={formatMoney(t.collected)}
          caption={`Rent for these months, of ${formatMoney(t.billed)} billed`}
          href={links.collected}
        />
        <StatCard
          title="Received"
          icon={<PaymentsRoundedIcon />}
          tone="primary"
          value={formatMoney(t.received)}
          // Counts corrections (adjustments) by the day they were made; Payments, which this opens, lists payments only.
          caption="Cash that came in these months, incl. corrections"
          href={links.received}
        />
        <StatCard
          title="Maintenance"
          icon={<HandymanRoundedIcon />}
          value={formatMoney(t.maintenance)}
          href={links.maintenance}
          caption={bySetOff > 0 ? `${formatMoney(t.maintenanceCash)} in cash · ${formatMoney(bySetOff)} by set-off` : "Spent on the houses"}
        />
        <StatCard
          title="Net (rent month)"
          value={formatMoney(t.netCollected)}
          caption="Collected − maintenance"
          badge={t.netCollected < 0 ? { label: "Loss", tone: "danger" } : undefined}
          {...netLook(t.netCollected)}
        />
        <StatCard
          title="Net cash"
          value={formatMoney(t.netCash)}
          caption="Received − maintenance paid in cash"
          badge={t.netCash < 0 ? { label: "Loss", tone: "danger" } : undefined}
          {...netLook(t.netCash, "gradient")}
        />
        <StatCard
          title="Spent of collected"
          icon={<PieChartRoundedIcon />}
          value={t.expenseRatio === null ? "—" : `${t.expenseRatio}%`}
          caption="Maintenance ÷ rent collected"
        />
      </StatCardRow>
      <EarningsChart months={months} />
      <EarningsTable months={months} rangeLabel={rangeLabel} />
    </Stack>
  );
}

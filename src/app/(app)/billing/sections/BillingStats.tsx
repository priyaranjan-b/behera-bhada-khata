import Grid from "@mui/material/Grid";
import type { BillingReport } from "@/lib/contracts";
import { collectionRateTone } from "@/lib/domain/overview";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/ui/StatCard";

/** Grid cell of one Billing stat card. */
export const BILLING_STAT_CELL = { xs: 6, lg: 3 } as const;

/** Billing: Billed, Collected and Balance for the range - three grid cells. */
export default async function BillingStats({ report, rangeLabel }: { report: Promise<BillingReport>; rangeLabel: string }) {
  const { totals, rows } = await report;
  const tenantCount = new Set(rows.map((r) => r.tenantId)).size;
  return (
    <>
      <Grid size={BILLING_STAT_CELL}>
        <StatCard
          title="Billed"
          value={formatMoney(totals.billed)}
          caption={`${rangeLabel} · ${tenantCount} tenant${tenantCount === 1 ? "" : "s"}`}
        />
      </Grid>
      <Grid size={BILLING_STAT_CELL}>
        <StatCard
          title="Collected"
          value={formatMoney(totals.collected)}
          caption="Paid towards these months"
          badge={
            totals.collectionRate === null
              ? undefined
              : { label: `${totals.collectionRate}%`, tone: collectionRateTone(totals.collectionRate) }
          }
        />
      </Grid>
      <Grid size={BILLING_STAT_CELL}>
        <StatCard
          title="Balance"
          value={formatMoney(totals.balance)}
          caption={totals.overdue > 0 ? `${formatMoney(totals.overdue)} overdue` : "Nothing overdue"}
          badge={totals.balance > 0 ? { label: "To collect", tone: "warning" } : { label: "Settled", tone: "success" }}
        />
      </Grid>
    </>
  );
}

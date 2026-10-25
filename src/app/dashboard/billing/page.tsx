import { cookies } from "next/headers";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { formatMonth, yearMonthOf } from "@/lib/dates";
import { rangeLength, rangeQuery, shiftRange } from "@/lib/domain/billing";
import { collectionRateTone } from "@/lib/domain/overview";
import { formatMoney } from "@/lib/money";
import { PAID_DIRECT_COOKIE, paidDirectViewOf } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import PaidDirectToggle from "@/components/domain/PaidDirectToggle";
import StatCard from "@/components/ui/StatCard";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { ActionStack } from "@/components/ui";
import { PageHeader } from "@/components/ui/DataDisplay";
import BillingGrid from "./BillingGrid";
import BillingRangeForm from "./BillingRangeForm";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const paidDirect = paidDirectViewOf((await cookies()).get(PAID_DIRECT_COOKIE)?.value);
  const report = await serverApi.dashboard.billing({ from, to, paidDirect });
  const range = { from: report.from, to: report.to };
  const months = rangeLength(range);
  const rangeLabel =
    months === 1 ? formatMonth(range.from) : `${formatMonth(range.from, "short")} – ${formatMonth(range.to, "short")}`;
  const { totals, received } = report;
  const tenantCount = new Set(report.rows.map((r) => r.tenantId)).size;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Billing"
        subtitle="Rent billed to each tenant per month, and what was collected for it."
        action={
          <ActionStack>
            {report.paidDirect.available ? <PaidDirectToggle shown={report.paidDirect.shown} /> : null}
            <PeriodSwitcher
              label={rangeLabel}
              unit={months === 1 ? "month" : `${months} months`}
              prevHref={routes.billing(rangeQuery(shiftRange(range, -1)))}
              nextHref={routes.billing(rangeQuery(shiftRange(range, 1)))}
            />
          </ActionStack>
        }
      />
      {/* Remount on a new range so the inputs show it. */}
      <BillingRangeForm key={`${range.from}-${range.to}`} from={yearMonthOf(range.from)} to={yearMonthOf(range.to)} />

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard
            title="Billed"
            value={formatMoney(totals.billed)}
            caption={`${rangeLabel} · ${tenantCount} tenant${tenantCount === 1 ? "" : "s"}`}
          />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
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
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard
            title="Balance"
            value={formatMoney(totals.balance)}
            caption={totals.overdue > 0 ? `${formatMoney(totals.overdue)} overdue` : "Nothing overdue"}
            badge={totals.balance > 0 ? { label: "To collect", tone: "warning" } : { label: "Settled", tone: "success" }}
          />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard
            title="Received"
            value={formatMoney(received.amount)}
            caption={
              `${received.payments} payment${received.payments === 1 ? "" : "s"} dated in ${months === 1 ? "this month" : "these months"}` +
              (received.paidDirect > 0 ? ` + ${formatMoney(received.paidDirect)} Govt paid direct` : "")
            }
          />
        </Grid>
      </Grid>

      <BillingGrid rows={report.rows} rangeLabel={rangeLabel} />
    </Stack>
  );
}

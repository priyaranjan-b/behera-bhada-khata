import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { dayRangeOfMonths, formatMonth, lastMonthKey, yearMonthOf } from "@/lib/dates";
import { rangeFromParams, rangeLength, rangeQuery, shiftRange } from "@/lib/domain/billing";
import { paidDirectQuery, paidDirectViewOf } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import { BILLING_LIMITS } from "@/lib/validation";
import PaidDirectOption from "@/components/domain/PaidDirectOption";
import AsyncSection from "@/components/ui/AsyncSection";
import ContextBar from "@/components/shell/ContextBar";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { PageHeader } from "@/components/ui/DataDisplay";
import MonthRangeForm from "@/components/ui/MonthRangeForm";
import { BILLING_SKELETONS as SKELETON } from "./billingSkeletons";
import BillingGridSection from "./sections/BillingGridSection";
import BillingStats, { BILLING_STAT_COLUMNS } from "./sections/BillingStats";
import ReceivedStat from "./sections/ReceivedStat";
import StatCardRow from "@/components/ui/StatCardRow";

// The page loads in sections (A12): the range comes straight from the URL, so
// the header, the range form and the switch render at once; the totals, the
// grid (one page at a time, paged in SQL, A15) and the cash received stream
// in on their own calls.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; paidDirect?: string }>;
}) {
  const params = await searchParams;
  const paidDirect = paidDirectViewOf(params.paidDirect);
  const range = rangeFromParams(params, lastMonthKey(), BILLING_LIMITS.maxMonths);
  const query = { ...rangeQuery(range), paidDirect };
  const totals = serverApi.dashboard.billingTotals(query);
  const grid = serverApi.dashboard.billing(query);
  const received = serverApi.dashboard.billingReceived(query);
  const paidDirectState = serverApi.dashboard.paidDirect({ paidDirect });

  const months = rangeLength(range);
  const rangeLabel =
    months === 1 ? formatMonth(range.from) : `${formatMonth(range.from, "short")} – ${formatMonth(range.to, "short")}`;
  const view = `${range.from}-${range.to}-${paidDirect}`;

  return (
    <Stack spacing={2}>
      <PageHeader title="Billing" subtitle="Rent billed to each tenant per month, and what was collected for it." />
      <ContextBar
        period={
          <PeriodSwitcher
            label={rangeLabel}
            unit={months === 1 ? "month" : `${months} months`}
            prevHref={routes.billing({ ...rangeQuery(shiftRange(range, -1)), ...paidDirectQuery(paidDirect) })}
            nextHref={routes.billing({ ...rangeQuery(shiftRange(range, 1)), ...paidDirectQuery(paidDirect) })}
          />
        }
        options={
          <>
            {/* Remount on a new range so the inputs show it. */}
            <MonthRangeForm
              key={`${range.from}-${range.to}`}
              from={yearMonthOf(range.from)}
              to={yearMonthOf(range.to)}
              path={routes.billing()}
              query={paidDirectQuery(paidDirect)}
            />
            <PaidDirectOption view={paidDirect} state={paidDirectState} />
          </>
        }
        activeCount={paidDirect === "show" ? 1 : 0}
        resetHref={routes.billing()}
      />

      <StatCardRow columns={BILLING_STAT_COLUMNS} label="Billing totals">
        <AsyncSection key={`stats-${view}`} title="Billing totals" fallback={SKELETON.stats} wide>
          <BillingStats totals={totals} rangeLabel={rangeLabel} />
        </AsyncSection>
        <AsyncSection key={`received-${view}`} title="Received" fallback={SKELETON.received}>
          <ReceivedStat received={received} months={months} href={routes.payments.list(dayRangeOfMonths(range.from, range.to))} />
        </AsyncSection>
      </StatCardRow>

      <AsyncSection key={view} title="Billing" fallback={SKELETON.grid}>
        <BillingGridSection grid={grid} query={query} rangeLabel={rangeLabel} />
      </AsyncSection>
    </Stack>
  );
}

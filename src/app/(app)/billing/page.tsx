import { cookies } from "next/headers";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { currentMonthKey, formatMonth, yearMonthOf } from "@/lib/dates";
import { rangeFromParams, rangeLength, rangeQuery, shiftRange } from "@/lib/domain/billing";
import { PAID_DIRECT_COOKIE, paidDirectViewOf } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import { BILLING_LIMITS } from "@/lib/validation";
import PaidDirectSwitch from "@/components/domain/PaidDirectSwitch";
import AsyncSection from "@/components/ui/AsyncSection";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { ActionStack } from "@/components/ui";
import { PageHeader } from "@/components/ui/DataDisplay";
import BillingRangeForm from "./BillingRangeForm";
import { BILLING_SKELETONS as SKELETON } from "./billingSkeletons";
import BillingGridSection from "./sections/BillingGridSection";
import BillingStats, { BILLING_STAT_CELL } from "./sections/BillingStats";
import ReceivedStat from "./sections/ReceivedStat";

// The page loads in sections (A12): the range comes straight from the URL, so
// the header, the range form and the switch render at once; the totals, the
// grid (one page at a time, paged in SQL, A15) and the cash received stream
// in on their own calls.
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const paidDirect = paidDirectViewOf((await cookies()).get(PAID_DIRECT_COOKIE)?.value);
  const range = rangeFromParams(params, currentMonthKey(), BILLING_LIMITS.maxMonths);
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
      <PageHeader
        title="Billing"
        subtitle="Rent billed to each tenant per month, and what was collected for it."
        action={
          <ActionStack>
            <AsyncSection key={paidDirect} title="Include Govt paid direct" fallback={null} silent>
              <PaidDirectSwitch state={paidDirectState} />
            </AsyncSection>
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
        <AsyncSection key={view} title="Billing totals" fallback={SKELETON.stats}>
          <BillingStats totals={totals} rangeLabel={rangeLabel} />
        </AsyncSection>
        <Grid size={BILLING_STAT_CELL}>
          <AsyncSection key={view} title="Received" fallback={SKELETON.received}>
            <ReceivedStat received={received} months={months} />
          </AsyncSection>
        </Grid>
      </Grid>

      <AsyncSection key={view} title="Billing" fallback={SKELETON.grid}>
        <BillingGridSection grid={grid} query={query} rangeLabel={rangeLabel} />
      </AsyncSection>
    </Stack>
  );
}

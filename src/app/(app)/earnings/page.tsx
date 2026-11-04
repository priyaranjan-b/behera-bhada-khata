import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { formatMonth, yearMonthOf } from "@/lib/dates";
import { rangeLength, rangeQuery, shiftRange } from "@/lib/domain/billing";
import { earningsRange } from "@/lib/domain/earnings";
import { paidDirectQuery, paidDirectViewOf } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import { EARNINGS_LIMITS } from "@/lib/validation";
import PaidDirectSwitch from "@/components/domain/PaidDirectSwitch";
import AsyncSection from "@/components/ui/AsyncSection";
import MonthRangeForm from "@/components/ui/MonthRangeForm";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { ActionStack } from "@/components/ui";
import { PageHeader } from "@/components/ui/DataDisplay";
import { EARNINGS_SKELETONS as SKELETON } from "./earningsSkeletons";
import EarningsSection from "./sections/EarningsSection";

// Effective earning (A23): rent in, maintenance out, by rent month and as
// cash. The months come from the URL (default: the last 12), so the header
// and the range form render at once; the figures stream in on one call.
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; paidDirect?: string }>;
}) {
  const params = await searchParams;
  const paidDirect = paidDirectViewOf(params.paidDirect);
  const range = earningsRange(params, EARNINGS_LIMITS);
  const earnings = serverApi.dashboard.earnings({ ...rangeQuery(range), paidDirect });
  const paidDirectState = serverApi.dashboard.paidDirect({ paidDirect });

  const months = rangeLength(range);
  const rangeLabel =
    months === 1 ? formatMonth(range.from) : `${formatMonth(range.from, "short")} – ${formatMonth(range.to, "short")}`;
  const view = `${range.from}-${range.to}-${paidDirect}`;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Earnings"
        subtitle="What the rent brings in once maintenance is paid, by rent month and as cash."
        action={
          <ActionStack>
            <AsyncSection key={paidDirect} title="Include Govt paid direct" fallback={null} silent>
              <PaidDirectSwitch state={paidDirectState} />
            </AsyncSection>
            <PeriodSwitcher
              label={rangeLabel}
              unit={months === 1 ? "month" : `${months} months`}
              prevHref={routes.earnings({ ...rangeQuery(shiftRange(range, -1)), ...paidDirectQuery(paidDirect) })}
              nextHref={routes.earnings({ ...rangeQuery(shiftRange(range, 1)), ...paidDirectQuery(paidDirect) })}
            />
          </ActionStack>
        }
      />
      {/* Remount on a new range so the inputs show it. */}
      <MonthRangeForm
        key={`${range.from}-${range.to}`}
        from={yearMonthOf(range.from)}
        to={yearMonthOf(range.to)}
        path={routes.earnings()}
        query={paidDirectQuery(paidDirect)}
      />
      <AsyncSection key={view} title="Earnings" fallback={SKELETON.view}>
        <EarningsSection earnings={earnings} rangeLabel={rangeLabel} />
      </AsyncSection>
    </Stack>
  );
}

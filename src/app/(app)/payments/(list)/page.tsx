import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { dayRangeFromParams, dayRangeLabel, dayRangeUnit, shiftDayRange } from "@/lib/domain/payments";
import { routes } from "@/lib/routes";
import { PAYMENTS_LIMITS } from "@/lib/validation";
import AsyncSection from "@/components/ui/AsyncSection";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import { PageHeader } from "@/components/ui/DataDisplay";
import PaymentsRangeForm from "./PaymentsRangeForm";
import { PAYMENTS_SKELETONS as SKELETON } from "./paymentsSkeletons";
import PaidDirectStat from "./sections/PaidDirectStat";
import PaymentsSection from "./sections/PaymentsSection";

// Every tenant's payments by the day they were received (A18). The days come
// straight from the URL, so the header and the date form render at once; the
// table with its per-mode cards (one call: the cards follow the table's search
// and filters) and Govt paid direct (by rent month) stream in on their own.
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const range = dayRangeFromParams(await searchParams, PAYMENTS_LIMITS.maxDays);
  const grid = serverApi.dashboard.payments.list(range);
  const paidDirect = serverApi.dashboard.payments.paidDirect(range);
  const tagSuggestions = serverApi.dashboard.payments.tagSuggestions();
  const rangeLabel = dayRangeLabel(range);
  const view = `${range.from}-${range.to}`;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Payments"
        subtitle="Every payment received from all tenants, by the day it came in."
        action={
          <PeriodSwitcher
            label={rangeLabel}
            unit={dayRangeUnit(range)}
            prevHref={routes.payments.list(shiftDayRange(range, -1))}
            nextHref={routes.payments.list(shiftDayRange(range, 1))}
          />
        }
      />
      {/* Remount on a new range so the inputs show it. Sibling keys must differ, or React keeps the old form. */}
      <PaymentsRangeForm key={`form-${view}`} from={range.from} to={range.to} />
      <AsyncSection key={`grid-${view}`} title="Payments" fallback={SKELETON.view}>
        <PaymentsSection
          grid={grid}
          range={range}
          rangeLabel={rangeLabel}
          tagSuggestions={tagSuggestions}
          paidDirectCard={
            <AsyncSection key={view} title="Govt paid direct" fallback={SKELETON.stat}>
              <PaidDirectStat paidDirect={paidDirect} />
            </AsyncSection>
          }
        />
      </AsyncSection>
    </Stack>
  );
}

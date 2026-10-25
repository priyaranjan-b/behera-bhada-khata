import { cookies } from "next/headers";
import { serverApi } from "@/lib/api-client/server";
import { addMonthsToKey, formatMonth, monthKeyFromParam, yearMonthOf } from "@/lib/dates";
import { PAID_DIRECT_COOKIE, paidDirectViewOf } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import { ActionStack } from "@/components/ui";
import AsyncSection from "@/components/ui/AsyncSection";
import { PageHeader } from "@/components/ui/DataDisplay";
import PeriodSwitcher from "@/components/ui/PeriodSwitcher";
import OverviewLayout from "./OverviewLayout";
import { OVERVIEW_SKELETONS as SKELETON } from "./overviewSkeletons";
import AttentionSection from "./sections/AttentionSection";
import DefaultersSection from "./sections/DefaultersSection";
import MonthStats from "./sections/MonthStats";
import MonthTenantsSection from "./sections/MonthTenantsSection";
import PaidDirectSwitch from "./sections/PaidDirectSwitch";
import PortfolioSection from "./sections/PortfolioSection";
import SitesSection from "./sections/SitesSection";
import TenantTypesSection from "./sections/TenantTypesSection";
import TrendSection from "./sections/TrendSection";
import VacantStat from "./sections/VacantStat";

// Each section loads on its own and streams in when ready (A12). Every call
// starts here, together, before anything awaits; a section's boundary is keyed
// by the params its data depends on, so switching month or the paid-direct
// view reloads only those cards.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; show?: string }>;
}) {
  const { month, show } = await searchParams;
  const paidDirect = paidDirectViewOf((await cookies()).get(PAID_DIRECT_COOKIE)?.value);
  const monthKey = monthKeyFromParam(month);
  const monthView = `${monthKey}-${paidDirect}`;

  const monthData = serverApi.dashboard.overview.month(yearMonthOf(monthKey), { paidDirect });
  const trend = serverApi.dashboard.overview.trend({ paidDirect });
  const houses = serverApi.dashboard.overview.houses();
  const attention = serverApi.dashboard.overview.attention();
  const portfolio = serverApi.dashboard.overview.portfolio({ paidDirect });
  const defaulters = serverApi.dashboard.defaulters();
  const paidDirectState = serverApi.dashboard.paidDirect({ paidDirect });

  return (
    <OverviewLayout
      header={
        <PageHeader
          title="Overview"
          subtitle="How rent is tracking across every property."
          action={
            <ActionStack>
              <AsyncSection key={paidDirect} title="Include Govt paid direct" fallback={null} silent>
                <PaidDirectSwitch state={paidDirectState} />
              </AsyncSection>
              <PeriodSwitcher
                label={formatMonth(monthKey)}
                prevHref={routes.dashboard({ month: yearMonthOf(addMonthsToKey(monthKey, -1)) })}
                nextHref={routes.dashboard({ month: yearMonthOf(addMonthsToKey(monthKey, 1)) })}
              />
            </ActionStack>
          }
        />
      }
      stats={
        <AsyncSection key={monthView} title="This month" fallback={SKELETON.stats}>
          <MonthStats month={monthData} trend={trend} />
        </AsyncSection>
      }
      vacant={
        <AsyncSection title="Vacant houses" fallback={SKELETON.vacant}>
          <VacantStat houses={houses} />
        </AsyncSection>
      }
      trend={
        <AsyncSection key={paidDirect} title="Billing vs collection" fallback={SKELETON.trend}>
          <TrendSection trend={trend} />
        </AsyncSection>
      }
      attention={
        <AsyncSection title="Needs attention" fallback={SKELETON.attention}>
          <AttentionSection attention={attention} />
        </AsyncSection>
      }
      defaulters={
        <AsyncSection title="Top defaulters" fallback={SKELETON.defaulters}>
          <DefaultersSection defaulters={defaulters} />
        </AsyncSection>
      }
      sites={
        <AsyncSection key={monthView} title="Collection by site" fallback={SKELETON.sites}>
          <SitesSection month={monthData} />
        </AsyncSection>
      }
      tenantTypes={
        <AsyncSection key={monthView} title="Tenant types" fallback={SKELETON.tenantTypes}>
          <TenantTypesSection month={monthData} />
        </AsyncSection>
      }
      portfolio={
        <AsyncSection key={paidDirect} title="Portfolio" fallback={SKELETON.portfolio}>
          <PortfolioSection portfolio={portfolio} houses={houses} />
        </AsyncSection>
      }
      tenants={
        <AsyncSection key={monthView} title="Tenants this month" fallback={SKELETON.tenants}>
          <MonthTenantsSection month={monthData} show={show} />
        </AsyncSection>
      }
    />
  );
}

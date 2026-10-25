import type { TenantAccount } from "@/lib/contracts";
import { currentMonthKey, formatMonth } from "@/lib/dates";
import TenantPeriodsGrid from "../TenantPeriodsGrid";

/** Tenant page: every rent month and how much of it is paid. */
export default async function MonthsSection({ account }: { account: Promise<TenantAccount> }) {
  const { periods } = await account;
  const thisMonth = currentMonthKey();
  return (
    <TenantPeriodsGrid
      rows={periods.map((p) => ({ ...p, monthLabel: formatMonth(p.periodMonth), notYetDue: p.periodMonth >= thisMonth }))}
    />
  );
}

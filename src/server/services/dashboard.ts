import "server-only";
import type { DefaultersReport } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { agingGroups, agingOf, compareAging } from "@/lib/domain/reports";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { OwnerContext } from "./context";
import { billedTenants, db, placements, recentPeriods } from "./loaders";
import { groupPeriods } from "./periods";
import { placementOf } from "./placements";

/**
 * Every tenant (current or moved out) with unpaid rent for a month that has
 * ended, most months behind first. Reads through ./loaders, so on the
 * Overview it shares the tenant list, rent months and placements (A12).
 */
export async function getDefaultersReport(_ctx: OwnerContext): Promise<DefaultersReport> {
  const todayMonthKey = currentMonthKey();
  const [allTenants, periods, placement, repos] = await Promise.all([
    billedTenants(),
    // Holds every unpaid month; the paid ones in it don't change the aging.
    recentPeriods(),
    placements(),
    db(),
  ]);
  const periodsByTenant = groupPeriods(periods);

  const behind = allTenants
    .map((tenant) => ({ tenant, aging: agingOf(periodsByTenant.get(tenant.id) ?? [], todayMonthKey) }))
    .filter(({ aging }) => aging.overdueMonths > 0);
  const payments = await repos.payments.listForTenants(
    behind.map(({ tenant }) => tenant.id),
    { status: "confirmed" }
  );
  const lastPaid = new Map<string, string>();
  for (const payment of payments) {
    const last = lastPaid.get(payment.tenant_id);
    if (!last || payment.payment_date > last) lastPaid.set(payment.tenant_id, payment.payment_date);
  }

  const rows = behind
    .map(({ tenant, aging }) => {
      const place = placementOf(placement, tenant.id);
      return {
        ...aging,
        tenantId: tenant.id,
        displayName: tenantDisplayName(tenant),
        contactName: tenant.business_name ? tenant.name : null,
        phone: tenant.phone,
        propertyName: place.propertyName,
        unitCodes: place.unitCodes,
        movedOut: tenant.status === "inactive",
        monthlyRent: place.monthlyRent,
        lastPaymentDate: lastPaid.get(tenant.id) ?? null,
      };
    })
    .sort(compareAging);

  return {
    asOfMonth: addMonthsToKey(todayMonthKey, -1),
    totalOutstanding: round2(rows.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    groups: agingGroups(rows),
    rows,
  };
}

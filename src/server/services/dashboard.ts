import "server-only";
import type { DefaulterRow, DefaultersReport } from "@/lib/contracts";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { agingGroups, agingOf, compareAging } from "@/lib/domain/reports";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { round2 } from "@/lib/money";
import type { RentPeriod, Tenant } from "@/lib/types";
import { ownerDb } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import type { OwnerContext } from "./context";
import { billedTenants } from "./overview";
import { groupPeriods } from "./periods";
import { loadPlacements, placementOf } from "./placements";

/**
 * Tenants (current or moved out) with unpaid rent for a month that has ended,
 * most months behind first. `periodsByTenant` must hold at least every unpaid month.
 */
async function defaulterRows(
  db: OwnerRepositories,
  allTenants: Tenant[],
  periodsByTenant: Map<string, RentPeriod[]>,
  todayMonthKey: string
): Promise<DefaulterRow[]> {
  const behind = allTenants
    .map((tenant) => ({ tenant, aging: agingOf(periodsByTenant.get(tenant.id) ?? [], todayMonthKey) }))
    .filter(({ aging }) => aging.overdueMonths > 0);
  const ids = behind.map(({ tenant }) => tenant.id);
  const [payments, placements] = await Promise.all([
    db.payments.listForTenants(ids, { status: "confirmed" }),
    loadPlacements(db, ids),
  ]);
  const lastPaid = new Map<string, string>();
  for (const payment of payments) {
    const last = lastPaid.get(payment.tenant_id);
    if (!last || payment.payment_date > last) lastPaid.set(payment.tenant_id, payment.payment_date);
  }

  return behind
    .map(({ tenant, aging }) => {
      const placement = placementOf(placements, tenant.id);
      return {
        ...aging,
        tenantId: tenant.id,
        displayName: tenantDisplayName(tenant),
        contactName: tenant.business_name ? tenant.name : null,
        phone: tenant.phone,
        propertyName: placement.propertyName,
        unitCodes: placement.unitCodes,
        movedOut: tenant.status === "inactive",
        monthlyRent: placement.monthlyRent,
        lastPaymentDate: lastPaid.get(tenant.id) ?? null,
      };
    })
    .sort(compareAging);
}

/**
 * Every tenant (current or moved out) with unpaid rent for a month that has
 * ended, most months behind first.
 */
export async function getDefaultersReport(_ctx: OwnerContext): Promise<DefaultersReport> {
  const todayMonthKey = currentMonthKey();
  const db = await ownerDb();
  // Shared with the Overview's sections in the same render (A12).
  const allTenants = await billedTenants();

  const periods = await db.rentPeriods.listForTenants(
    allTenants.map((t) => t.id),
    { openOnly: true }
  );
  const rows = await defaulterRows(db, allTenants, groupPeriods(periods), todayMonthKey);

  return {
    asOfMonth: addMonthsToKey(todayMonthKey, -1),
    totalOutstanding: round2(rows.reduce((sum, r) => sum + r.totalOutstanding, 0)),
    groups: agingGroups(rows),
    rows,
  };
}

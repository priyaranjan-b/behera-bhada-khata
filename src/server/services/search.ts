import "server-only";
import type { SearchIndex } from "@/lib/contracts";
import { todayKey } from "@/lib/dates";
import { tenantDisplayName } from "@/lib/domain/tenant";
import { ownerDb } from "@/server/infra";
import type { OwnerContext } from "./context";
import { holdsUnit, loadPlacements, placementOf } from "./placements";

/**
 * What the top-bar search matches on: every tenant and every house in use.
 * Small enough (one owner's register) to send whole and filter in the browser.
 * No balances, so it skips rent-period upkeep and stays cheap.
 */
export async function getSearchIndex(_ctx: OwnerContext): Promise<SearchIndex> {
  const db = await ownerDb();
  const [tenants, units, occupancy, properties] = await Promise.all([
    db.tenants.list(),
    db.units.list(),
    db.occupancy.list(),
    db.properties.list(),
  ]);
  const placements = await loadPlacements(
    db,
    tenants.map((t) => t.id)
  );

  const tenantsById = new Map(tenants.map((t) => [t.id, t]));
  const propertyName = new Map(properties.map((p) => [p.property_code, p.name]));
  const today = todayKey();
  const holder = new Map<string, string>();
  for (const o of occupancy) if (holdsUnit(o, today)) holder.set(o.unit_code, o.tenant_id);

  return {
    tenants: tenants.map((t) => ({
      tenantId: t.id,
      displayName: tenantDisplayName(t),
      name: t.name,
      businessName: t.business_name,
      status: t.status,
      unitCodes: placementOf(placements, t.id).unitCodes,
    })),
    units: units
      .filter((u) => u.is_active)
      .map((u) => {
        const occupant = tenantsById.get(holder.get(u.unit_code) ?? "");
        return {
          unitCode: u.unit_code,
          label: u.label,
          propertyCode: u.property_code,
          propertyName: propertyName.get(u.property_code) ?? u.property_code,
          occupant: occupant ? { tenantId: occupant.id, displayName: tenantDisplayName(occupant) } : null,
        };
      }),
  };
}

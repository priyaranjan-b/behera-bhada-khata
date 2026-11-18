import type { SearchIndex } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import { TENANT_STATUS_DISPLAY, formatUnits } from "./tenant";

// Top-bar search: matches tenants by name or business, and houses by their
// nickname (label), code or house number. Pure, so it runs in the browser
// against the index from GET /api/dashboard/search.

export interface SearchSuggestion {
  kind: "tenant" | "unit";
  key: string;
  primary: string;
  secondary: string;
  /** Page to open: the tenant, the house's occupant, or a vacant house's tower. */
  href: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 0 = starts with the query, 1 = a word starts with it, 2 = contains it, null = no match. */
function matchRank(text: string | null | undefined, query: string): number | null {
  if (!text) return null;
  const t = normalize(text);
  if (t.startsWith(query)) return 0;
  if (t.split(/[\s\-_.,/()]+/).some((word) => word.startsWith(query))) return 1;
  return t.includes(query) ? 2 : null;
}

function bestRank(texts: (string | null | undefined)[], query: string): number | null {
  const ranks = texts.map((t) => matchRank(t, query)).filter((r): r is number => r !== null);
  return ranks.length ? Math.min(...ranks) : null;
}

interface PayableTenant {
  tenantId: string;
  primary: string;
  secondary: string;
}

/**
 * The phone "Record payment" picker: tenants who can record one
 * (`canRecordPayment`), every one when the query is empty (alphabetical),
 * otherwise matched by name, business or house like the top-bar search, best
 * match first; moved-out tenants after current ones, marked "Moved out".
 */
export function payableTenants(index: SearchIndex, rawQuery: string): PayableTenant[] {
  const query = normalize(rawQuery);
  const scored: { rank: number; tenant: PayableTenant }[] = [];
  for (const t of index.tenants) {
    if (!t.canRecordPayment) continue;
    const rank = query
      ? bestRank([t.name, t.businessName, ...t.unitCodes, ...t.unitCodes.map((c) => c.split("-").pop())], query)
      : 0;
    if (rank === null) continue;
    const movedOut = t.status === "inactive";
    scored.push({
      rank: rank * 2 + (movedOut ? 1 : 0),
      tenant: {
        tenantId: t.tenantId,
        primary: t.displayName,
        secondary: [
          t.businessName ? t.name : null,
          t.unitCodes.length ? formatUnits(t.unitCodes) : null,
          movedOut ? TENANT_STATUS_DISPLAY.inactive.label : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.tenant.primary.localeCompare(b.tenant.primary))
    .map((s) => s.tenant);
}

export function searchSuggestions(index: SearchIndex, rawQuery: string, limit = 8): SearchSuggestion[] {
  const query = normalize(rawQuery);
  if (!query) return [];

  const scored: { rank: number; suggestion: SearchSuggestion }[] = [];

  for (const t of index.tenants) {
    const rank = bestRank([t.name, t.businessName], query);
    if (rank === null) continue;
    const details = [
      // The display name is the business when there is one; then show the person.
      t.businessName ? t.name : null,
      t.unitCodes.length ? formatUnits(t.unitCodes) : null,
      t.status === "active" ? null : TENANT_STATUS_DISPLAY[t.status].label,
    ].filter(Boolean);
    scored.push({
      // Moved-out tenants after everyone current with the same match quality.
      rank: rank * 2 + (t.status === "inactive" ? 1 : 0),
      suggestion: {
        kind: "tenant",
        key: `tenant:${t.tenantId}`,
        primary: t.displayName,
        secondary: details.join(" · "),
        href: routes.tenants.detail(t.tenantId),
      },
    });
  }

  for (const u of index.units) {
    const rank = bestRank([u.label, u.unitCode, u.unitCode.split("-").pop()], query);
    if (rank === null) continue;
    scored.push({
      rank: rank * 2,
      suggestion: {
        kind: "unit",
        key: `unit:${u.unitCode}`,
        primary: u.label ?? u.unitCode,
        secondary: [
          u.label ? u.unitCode : u.propertyName,
          u.occupant ? `Occupied by ${u.occupant.displayName}` : "Vacant",
        ].join(" · "),
        href: u.occupant ? routes.tenants.detail(u.occupant.tenantId) : routes.properties.detail(u.propertyCode),
      },
    });
  }

  // Best matches win the limited slots; then tenants before houses, so each
  // group's rows are contiguous (the dropdown groups by kind). Sorts are stable.
  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .sort((a, b) => (a.suggestion.kind === b.suggestion.kind ? 0 : a.suggestion.kind === "tenant" ? -1 : 1))
    .map((s) => s.suggestion);
}

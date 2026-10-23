import type { SearchIndex } from "@/lib/contracts";
import { formatUnits } from "./tenant";

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
      t.status === "draft" ? "Draft" : t.status === "inactive" ? "Moved out" : null,
    ].filter(Boolean);
    scored.push({
      // Moved-out tenants after everyone current with the same match quality.
      rank: rank * 2 + (t.status === "inactive" ? 1 : 0),
      suggestion: {
        kind: "tenant",
        key: `tenant:${t.tenantId}`,
        primary: t.displayName,
        secondary: details.join(" · "),
        href: `/dashboard/tenants/${t.tenantId}`,
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
        href: u.occupant ? `/dashboard/tenants/${u.occupant.tenantId}` : `/dashboard/properties/${u.propertyCode}`,
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

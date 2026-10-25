import { addMonthsToKey } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { TENANT_KINDS, type TenantKind } from "@/lib/types";
import { TENANT_KIND_LABELS } from "./tenant";

// Pure aggregations behind the Overview page's cards (collection by site,
// tenant types, needs attention). The service gathers the rows; nothing here
// touches the database.

/** Badge tone for a collection %: 90+ good, 60+ needs a look, below that behind. */
export function collectionRateTone(percent: number): "success" | "warning" | "danger" {
  return percent >= 90 ? "success" : percent >= 60 ? "warning" : "danger";
}

const rate = (collected: number, expected: number) => (expected > 0 ? Math.round((collected / expected) * 100) : null);

export interface SiteCollection {
  siteCode: string;
  siteName: string;
  expected: number;
  collected: number;
  /** Unpaid to the end of last month. */
  outstanding: number;
  /** Collected as a % of expected; null when nothing was due. */
  collectionRate: number | null;
}

/**
 * The month's expected and collected rent, and arrears, per site. A tenant
 * with houses on several sites is split evenly across their houses, the same
 * rule as a tower's monthly rent (A9). Every site is listed, in the order given.
 */
export function buildSiteCollection(
  sites: { code: string; name: string }[],
  rows: { monthDue: number; monthAllocated: number; totalOutstanding: number; siteCodes: string[] }[]
): SiteCollection[] {
  const totals = new Map(sites.map((s) => [s.code, { expected: 0, collected: 0, outstanding: 0 }]));
  for (const row of rows) {
    if (row.siteCodes.length === 0) continue;
    const share = 1 / row.siteCodes.length;
    for (const code of row.siteCodes) {
      const t = totals.get(code);
      if (!t) continue;
      t.expected += row.monthDue * share;
      t.collected += row.monthAllocated * share;
      t.outstanding += row.totalOutstanding * share;
    }
  }
  return sites.map((s) => {
    const t = totals.get(s.code)!;
    return {
      siteCode: s.code,
      siteName: s.name,
      expected: round2(t.expected),
      collected: round2(t.collected),
      outstanding: round2(t.outstanding),
      collectionRate: rate(t.collected, t.expected),
    };
  });
}

export interface KindBreakdown {
  kind: TenantKind;
  label: string;
  /** Current (active) tenants of this type. */
  tenants: number;
  expected: number;
  collected: number;
  outstanding: number;
  /** Tenants with at least one ended month unpaid (moved-out ones included). */
  overdueTenants: number;
  /** Government tenants whose rent goes to the owner directly (0016), and their agreement rent. */
  paidDirectTenants: number;
  paidDirectRent: number;
}

/** Tenants, the month's billing and arrears by tenant type, every type listed. */
export function buildKindBreakdown(
  tenants: {
    kind: TenantKind;
    current: boolean;
    rentTracked: boolean;
    monthlyRent: number;
    monthDue: number;
    monthAllocated: number;
    totalOutstanding: number;
    overdueMonths: number;
  }[]
): KindBreakdown[] {
  return TENANT_KINDS.map((kind) => {
    const of = tenants.filter((t) => t.kind === kind);
    const sum = (pick: (t: (typeof of)[number]) => number) => round2(of.reduce((s, t) => s + pick(t), 0));
    const direct = of.filter((t) => t.current && !t.rentTracked);
    return {
      kind,
      label: TENANT_KIND_LABELS[kind],
      tenants: of.filter((t) => t.current).length,
      expected: sum((t) => t.monthDue),
      collected: sum((t) => t.monthAllocated),
      outstanding: sum((t) => t.totalOutstanding),
      overdueTenants: of.filter((t) => t.overdueMonths > 0).length,
      paidDirectTenants: direct.length,
      paidDirectRent: round2(direct.reduce((s, t) => s + t.monthlyRent, 0)),
    };
  });
}

/** A rent unchanged for this many months is due for its yearly revision. */
export const RENT_REVIEW_MONTHS = 12;

/** Whether a billed tenant's rent has gone RENT_REVIEW_MONTHS or more without a change. */
export function rentReviewDue(rateMonths: string[], todayMonthKey: string): boolean {
  if (rateMonths.length === 0) return false;
  const latest = [...rateMonths].sort().at(-1)!;
  return latest <= addMonthsToKey(todayMonthKey, -RENT_REVIEW_MONTHS);
}

export const ATTENTION_KINDS = ["drafts", "noDocuments", "unacknowledged", "rentReview"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const ATTENTION_LABELS: Record<AttentionKind, { title: string; hint: string }> = {
  drafts: { title: "Drafts to complete", hint: "Add phone, rent and lease start to start billing" },
  noDocuments: { title: "No documents on file", hint: "Upload ID proof or the agreement" },
  unacknowledged: { title: "Payments not acknowledged", hint: "Tenant hasn't signed the receipt yet" },
  rentReview: { title: `Rent unchanged for ${RENT_REVIEW_MONTHS}+ months`, hint: "Yearly rent revision may be due" },
};

export interface AttentionItem {
  kind: AttentionKind;
  title: string;
  hint: string;
  tenants: { tenantId: string; displayName: string }[];
}

/** The non-empty "Needs attention" lists, in ATTENTION_KINDS order. */
export function buildAttention(lists: Partial<Record<AttentionKind, AttentionItem["tenants"]>>): AttentionItem[] {
  return ATTENTION_KINDS.filter((kind) => (lists[kind]?.length ?? 0) > 0).map((kind) => ({
    kind,
    ...ATTENTION_LABELS[kind],
    tenants: [...lists[kind]!].sort((a, b) => a.displayName.localeCompare(b.displayName)),
  }));
}

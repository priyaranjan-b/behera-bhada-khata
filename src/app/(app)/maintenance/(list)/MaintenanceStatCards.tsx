"use client";

import { use } from "react";
import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import LabelOffRoundedIcon from "@mui/icons-material/LabelOffRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import type { GridFilterModel } from "@mui/x-data-grid";
import { isCardFilterOn, toggleCardFilter, type CardFilter } from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import type { MaintenanceTotals } from "@/lib/contracts";
import { maintenanceCategoryLabel } from "@/lib/domain/maintenance";
import { formatMoney } from "@/lib/money";

/** "32% of spent", or nothing when nothing was spent. */
const shareOf = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}% of spent` : "Nothing spent");

/** "All 12 expenses", "1 expense", "No expenses": the Spent caption says it counts the whole period. */
const countText = (count: number) => (count === 0 ? "No expenses" : count === 1 ? "1 expense" : `All ${count} expenses`);

/**
 * The Maintenance stat cards: the days' expenses that aren't voided, on their
 * own call, so the table's search, filters and a tapped card never change them
 * (A18). The category and payer cards filter the table to the expenses they
 * count; tapped again, they clear it (A28). "Spent" is the whole period, and
 * "Payer not tagged" has no column filter for "no tags". Four cards of
 * MaintenanceView's StatCardRow.
 */
export default function MaintenanceStatCards({
  totals: totalsPromise,
  filter,
  setFilter,
  rangeLabel,
}: {
  totals: Promise<MaintenanceTotals>;
  /** The table's filter model, which the cards toggle their filter in. */
  filter: GridFilterModel;
  setFilter: (filter: GridFilterModel) => unknown;
  /** The days, "October 2026": Spent says it counts all of them, not just the filtered rows. */
  rangeLabel: string;
}) {
  const totals = use(totalsPromise);
  const categories = Object.entries(totals.byCategory)
    .map(([category, amount]) => ({ label: maintenanceCategoryLabel(category), amount: amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const [topPayer, ...otherPayers] = totals.byPaidBy;
  const cardFilter = (f: CardFilter | null) =>
    f ? { onClick: () => void setFilter(toggleCardFilter(filter, f)), selected: isCardFilterOn(filter, f) } : {};
  const categoryFilter: CardFilter | null = categories[0] ? { field: "category", operator: "is", value: categories[0].label } : null;
  const payerFilter: CardFilter | null = topPayer ? { field: "tags", operator: "is", value: topPayer.name } : null;

  return (
    <>
      <StatCard
        title="Spent"
        icon={<HandymanRoundedIcon />}
        tone="primary"
        variant="gradient"
        value={formatMoney(totals.amount)}
        caption={`${countText(totals.count)} in ${rangeLabel}${
          totals.cash < totals.amount ? ` · ${formatMoney(totals.amount - totals.cash)} by set-off` : ""
        }`}
      />
      <StatCard
        title={categories[0] ? `Most on ${categories[0].label}` : "Biggest category"}
        icon={<CategoryRoundedIcon />}
        value={formatMoney(categories[0]?.amount ?? 0)}
        {...cardFilter(categoryFilter)}
        caption={
          categories[1]
            ? `Then ${categories[1].label}: ${formatMoney(categories[1].amount)}`
            : shareOf(categories[0]?.amount ?? 0, totals.amount)
        }
      />
      <StatCard
        title={topPayer ? `Paid by ${topPayer.name}` : "Paid by"}
        icon={<PersonRoundedIcon />}
        value={formatMoney(topPayer?.amount ?? 0)}
        {...cardFilter(payerFilter)}
        caption={
          otherPayers.length > 0
            ? otherPayers
                .slice(0, 2)
                .map((p) => `${p.name} ${formatMoney(p.amount)}`)
                .join(" · ")
            : topPayer
              ? shareOf(topPayer.amount, totals.amount)
              : "No one tagged yet"
        }
      />
      <StatCard
        title="Payer not tagged"
        icon={<LabelOffRoundedIcon />}
        tone={totals.untagged > 0 ? "warning" : "neutral"}
        value={formatMoney(totals.untagged)}
        caption={shareOf(totals.untagged, totals.amount)}
      />
    </>
  );
}

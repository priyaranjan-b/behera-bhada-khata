import type { GridFilterItem, GridFilterModel } from "@mui/x-data-grid";

/**
 * A column filter a stat card above a table applies (A28): "Cash" above the
 * Payments table is `{ field: "mode", operator: "is", value: "Cash" }`.
 * A server-side table filters on the labels its column shows.
 */
export interface CardFilter {
  field: string;
  operator: string;
  value: string | readonly string[];
}

const sameValue = (a: unknown, b: CardFilter["value"]) =>
  Array.isArray(b) ? Array.isArray(a) && a.length === b.length && b.every((v) => a.includes(v)) : a === b;

/** Whether the table is filtered exactly as the card filters it: the card shows as selected. */
export function isCardFilterOn(model: GridFilterModel, filter: CardFilter): boolean {
  return model.items.some(
    (item) => item.field === filter.field && item.operator === filter.operator && sameValue(item.value, filter.value)
  );
}

/**
 * The table's filter after the card is tapped: on, it replaces any filter on
 * the same column (other columns' filters stay); tapped again, it clears
 * that column.
 */
export function toggleCardFilter(model: GridFilterModel, filter: CardFilter): GridFilterModel {
  const others = model.items.filter((item) => item.field !== filter.field);
  if (isCardFilterOn(model, filter)) return { ...model, items: others };
  const item: GridFilterItem = {
    id: `card-${filter.field}`,
    field: filter.field,
    operator: filter.operator,
    value: Array.isArray(filter.value) ? [...filter.value] : filter.value,
  };
  return { ...model, items: [...others, item] };
}

import type { GridColDef, GridFilterItem, GridValidRowModel } from "@mui/x-data-grid";

// The phone filter sheet's column filter: one simple control per column
// instead of the grid's column / operator / value builder (A30). The free
// Data Grid keeps a single column filter, so this reads and writes that one
// item: chips for a fixed set of values, "contains" for text, at least / at
// most / exactly for numbers. Columns with none of those operators (dates)
// stay with the wide-screen filter panel.

export type ColumnFilterKind = "choice" | "text" | "number";

export const NUMBER_OPERATORS = [
  { value: ">=", label: "At least", symbol: "≥" },
  { value: "<=", label: "At most", symbol: "≤" },
  { value: "=", label: "Exactly", symbol: "=" },
] as const;
export type NumberOperator = (typeof NUMBER_OPERATORS)[number]["value"];

export interface FilterColumn {
  field: string;
  label: string;
  kind: ColumnFilterKind;
  /** A choice column's values and the labels its chips show. */
  options: { value: string; label: string }[];
}

export type NumberFilterValue = { kind: "number"; operator: NumberOperator; amount: string };

export type ColumnFilterValue = { kind: "choice"; values: string[] } | { kind: "text"; text: string } | NumberFilterValue;

/** What the grid's single filter item is, as the sheet sees it. */
export type ReadFilter =
  | { state: "none" }
  | { state: "simple"; column: FilterColumn; value: ColumnFilterValue }
  /** Set on a wide screen with an operator the sheet has no control for: shown, removable, not editable. */
  | { state: "other"; item: GridFilterItem };

/** The columns the sheet can filter, in grid order. `columns` are the grid's own (operators filled in). */
export function filterColumnsOf<R extends GridValidRowModel>(columns: readonly GridColDef<R>[]): FilterColumn[] {
  const result: FilterColumn[] = [];
  for (const col of columns) {
    if (col.filterable === false || col.type === "actions") continue;
    const operators = new Set((col.filterOperators ?? []).map((op) => op.value));
    const kind: ColumnFilterKind | null =
      col.type === "singleSelect" && operators.has("isAnyOf")
        ? "choice"
        : col.type === "number" && NUMBER_OPERATORS.every((op) => operators.has(op.value))
          ? "number"
          : operators.has("contains")
            ? "text"
            : null;
    if (!kind) continue;
    const options = kind === "choice" ? optionsOf(col) : [];
    if (kind === "choice" && options.length === 0) continue;
    result.push({ field: col.field, label: col.headerName || col.field, kind, options });
  }
  return result;
}

function optionsOf<R extends GridValidRowModel>(col: GridColDef<R>): FilterColumn["options"] {
  const raw = "valueOptions" in col ? col.valueOptions : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) =>
    typeof o === "object" && o !== null ? { value: String(o.value), label: String(o.label) } : { value: String(o), label: String(o) }
  );
}

/** The grid's filter item (the first; there is only one) as the sheet's control state. */
export function readColumnFilter(items: readonly GridFilterItem[], columns: readonly FilterColumn[]): ReadFilter {
  const item = items.find((i) => isActive(i));
  if (!item) return { state: "none" };
  const column = columns.find((c) => c.field === item.field);
  const value = column ? valueOf(column, item) : null;
  return column && value ? { state: "simple", column, value } : { state: "other", item };
}

function isActive(item: GridFilterItem): boolean {
  if (item.operator === "isEmpty" || item.operator === "isNotEmpty") return true;
  if (Array.isArray(item.value)) return item.value.length > 0;
  return item.value !== undefined && item.value !== null && String(item.value).trim() !== "";
}

function valueOf(column: FilterColumn, item: GridFilterItem): ColumnFilterValue | null {
  switch (column.kind) {
    case "choice":
      if (item.operator === "isAnyOf" && Array.isArray(item.value)) return { kind: "choice", values: item.value.map(String) };
      if (item.operator === "is") return { kind: "choice", values: [String(item.value)] };
      return null;
    case "text":
      return item.operator === "contains" ? { kind: "text", text: String(item.value) } : null;
    case "number": {
      const op = NUMBER_OPERATORS.find((o) => o.value === item.operator);
      return op ? { kind: "number", operator: op.value, amount: String(item.value) } : null;
    }
  }
}

/** The filter item for a control's state, or none when it filters nothing (no chips, empty text). */
export function toFilterItem(field: string, value: ColumnFilterValue): GridFilterItem | null {
  switch (value.kind) {
    case "choice":
      return value.values.length > 0 ? { id: field, field, operator: "isAnyOf", value: value.values } : null;
    case "text": {
      const text = value.text.trim();
      return text ? { id: field, field, operator: "contains", value: text } : null;
    }
    case "number": {
      const amount = amountOf(value.amount);
      return value.amount.trim() !== "" && Number.isFinite(amount)
        ? { id: field, field, operator: value.operator, value: amount }
        : null;
    }
  }
}

/** A number control before anything is typed. */
export function emptyNumberValue(): NumberFilterValue {
  return { kind: "number", operator: ">=", amount: "" };
}

/** A typed amount as a number; "5,000" is 5000. */
function amountOf(text: string): number {
  return Number(text.replace(/,/g, ""));
}

/** A short text for the active-filter chip: "Mode: Cash, UPI +1", "Tenant: “ram”", "Amount: ≥ ₹5,000". */
export function describeColumnFilter(
  column: FilterColumn,
  value: ColumnFilterValue,
  formatNumber: (n: number) => string
): string {
  switch (value.kind) {
    case "choice": {
      const labels = value.values.map((v) => column.options.find((o) => o.value === v)?.label ?? v);
      const shown = labels.slice(0, 2).join(", ");
      return `${column.label}: ${shown}${labels.length > 2 ? ` +${labels.length - 2}` : ""}`;
    }
    case "text":
      return `${column.label}: “${value.text}”`;
    case "number": {
      const symbol = NUMBER_OPERATORS.find((o) => o.value === value.operator)?.symbol ?? "";
      const n = amountOf(value.amount);
      return `${column.label}: ${symbol} ${Number.isFinite(n) ? formatNumber(n) : value.amount}`;
    }
  }
}

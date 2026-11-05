import { round2 } from "@/lib/money";

/** A footer total: the column's field, its header and the sum. */
export interface ColumnTotal {
  field: string;
  label: string;
  amount: number;
}

/**
 * Adds up each column over `rows` (A26). A value that isn't a finite number
 * (a blank cell, a dash) counts as nothing. Pure, so the footer and the Excel
 * download share it.
 */
export function sumColumns<R, C extends { field: string; headerName?: string }>(
  rows: readonly R[],
  columns: readonly C[],
  valueOf: (row: R, column: C) => unknown
): ColumnTotal[] {
  return columns.map((col) => ({
    field: col.field,
    label: col.headerName ?? col.field,
    amount: rows.reduce((sum, row) => {
      const value = valueOf(row, col);
      return typeof value === "number" && Number.isFinite(value) ? round2(sum + value) : sum;
    }, 0),
  }));
}

/** The server's totals for the given columns; a column the server didn't add up is left out. */
export function pickColumnTotals(
  columns: readonly { field: string; label: string }[],
  totals: Partial<Record<string, number>>
): ColumnTotal[] {
  return columns.flatMap((col) => {
    const amount = totals[col.field];
    return amount === undefined ? [] : [{ field: col.field, label: col.label, amount }];
  });
}

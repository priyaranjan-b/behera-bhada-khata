// Adjust to your currency - used only for display, all storage/math is in the
// numeric(12,2) columns via plain numbers.
export const CURRENCY_SYMBOL = "₹";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `${CURRENCY_SYMBOL}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

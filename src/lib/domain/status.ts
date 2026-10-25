/** "partially_paid" -> "Partially paid": the label for a rent-month or ledger status. */
export function statusLabel(status: string): string {
  const label = status.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// A tenant's ledger: rent charges, payments and adjustments in one journal
// with a running balance. Built, paged, searched and sorted by
// tenant_ledger_page() in SQL (0020, A15); these are its shapes and fields.

export type LedgerEntryType = "charge" | "payment" | "adjustment";
/** "upcoming": a rent charge for this month or later - shown, but not owed (or counted) until the month ends. */
export type LedgerRowStatus = "billed" | "upcoming" | "confirmed" | "pending";

/** A file attached to a payment as proof (payment_proofs, 0009). */
export interface LedgerProof {
  id: string;
  fileName: string;
  contentType: string;
}

export interface LedgerRow {
  id: string;
  type: LedgerEntryType;
  date: string; // yyyy-mm-dd, used for sorting/filtering
  /** "Rent due — October 2026", "Payment received (cash) — note", "Adjustment — reason". */
  description: string;
  /** "Charge", or "#2026/10/001 · signed by tenant". */
  caption: string;
  debit: number;
  credit: number;
  /** Running balance after this row, over the whole ledger (not just the page). */
  balance: number;
  status: LedgerRowStatus;
  refId?: string; // payment/adjustment id, for receipt/adjust/resend actions
  receiptNo?: string; // 2026/10/001 or ADJ/2026/10/001 (0012), as printed on the receipt
  proofs?: LedgerProof[]; // payments only
  /** Payments/adjustments: the tenant signed + verified (optional; 0010). */
  acknowledged?: boolean;
}

// The Ledger table (A15): what it sorts and filters in SQL.
export const LEDGER_SORT_FIELDS = ["date", "description", "status", "debit", "credit", "balance"] as const;
export const LEDGER_FILTER_FIELDS = ["date", "description", "status"] as const;

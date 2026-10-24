import { dateKeyOf, formatMonth } from "@/lib/dates";
import { round2 } from "@/lib/money";

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
  description: string;
  debit: number;
  credit: number;
  balance: number; // running balance after this row, in chronological order
  status: LedgerRowStatus;
  refId?: string; // payment/adjustment id, for receipt/adjust/resend actions
  receiptNo?: string; // 2026/10/001 or ADJ/2026/10/001 (0012), as printed on the receipt
  proofs?: LedgerProof[]; // payments only
  /** Payments/adjustments: the tenant signed + verified (optional; 0010). */
  acknowledged?: boolean;
}

interface PeriodInput {
  id: string;
  period_month: string;
  amount_due: number | string;
}

interface PaymentInput {
  id: string;
  amount: number | string;
  payment_date: string;
  mode: string;
  note: string | null;
  status: string;
  acknowledged_at?: string | null;
  receipt_no?: string;
  proofs?: LedgerProof[];
}

interface AdjustmentInput {
  id: string;
  delta_amount: number | string;
  reason: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  acknowledged_at?: string | null;
  receipt_no?: string;
}

// Pure aggregation - merges rent charges (debits) with payments and
// adjustments (credits) into one chronological journal, then walks it in
// date order to compute a running balance the way a real ledger would.
// Since 0010 every payment/adjustment is confirmed when recorded and moves
// the balance at once (the tenant's acknowledgement is optional and changes
// nothing). A "pending" row could only be left from before 0010; it's shown
// but, like rent_periods.amount_allocated, not counted.
//
// Rent for the current month and later is shown as "upcoming" and left out
// of the balance, matching summarizeBalance: a month counts once it's over.
export function buildTenantLedger(
  periods: PeriodInput[],
  payments: PaymentInput[],
  adjustments: AdjustmentInput[],
  todayMonthKey: string
): LedgerRow[] {
  type Draft = Omit<LedgerRow, "balance">;
  const draft: Draft[] = [];

  for (const period of periods) {
    draft.push({
      id: `charge-${period.id}`,
      type: "charge",
      date: period.period_month,
      description: `Rent due — ${formatMonth(period.period_month)}`,
      debit: round2(Number(period.amount_due)),
      credit: 0,
      status: period.period_month < todayMonthKey ? "billed" : "upcoming",
    });
  }

  for (const payment of payments) {
    draft.push({
      id: `payment-${payment.id}`,
      type: "payment",
      date: payment.payment_date,
      description: `Payment received (${payment.mode.replace(/_/g, " ")})${payment.note ? ` — ${payment.note}` : ""}`,
      debit: 0,
      credit: round2(Number(payment.amount)),
      status: payment.status === "confirmed" ? "confirmed" : "pending",
      refId: payment.id,
      receiptNo: payment.receipt_no,
      proofs: payment.proofs ?? [],
      acknowledged: Boolean(payment.acknowledged_at),
    });
  }

  for (const adjustment of adjustments) {
    const delta = Number(adjustment.delta_amount);
    draft.push({
      id: `adjustment-${adjustment.id}`,
      type: "adjustment",
      date: dateKeyOf(adjustment.confirmed_at ?? adjustment.created_at),
      description: `Adjustment — ${adjustment.reason}`,
      debit: delta < 0 ? round2(-delta) : 0,
      credit: delta > 0 ? round2(delta) : 0,
      status: adjustment.status === "confirmed" ? "confirmed" : "pending",
      refId: adjustment.id,
      receiptNo: adjustment.receipt_no,
      acknowledged: Boolean(adjustment.acknowledged_at),
    });
  }

  draft.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  let balance = 0;
  return draft.map((row) => {
    if (row.status !== "pending" && row.status !== "upcoming") {
      balance = round2(balance + row.debit - row.credit);
    }
    return { ...row, balance };
  });
}

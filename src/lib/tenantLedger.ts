import { round2 } from "@/lib/money";

export type LedgerEntryType = "charge" | "payment" | "adjustment";
export type LedgerRowStatus = "billed" | "confirmed" | "pending";

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
  rawAmount?: number; // signed original amount (payments/adjustments), for resend
}

function formatMonthLabel(periodMonth: string): string {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
}

interface AdjustmentInput {
  id: string;
  delta_amount: number | string;
  reason: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

// Pure aggregation - merges rent charges (debits) with payments and
// adjustments (credits) into one chronological journal, then walks it in
// date order to compute a running balance the way a real ledger would.
// Pending payments/adjustments are shown (so the owner can see what's
// awaiting tenant sign-off) but don't move the balance yet - only confirmed
// entries do, matching how rent_periods.amount_allocated itself only
// updates on confirmation.
export function buildTenantLedger(
  periods: PeriodInput[],
  payments: PaymentInput[],
  adjustments: AdjustmentInput[]
): LedgerRow[] {
  type Draft = Omit<LedgerRow, "balance">;
  const draft: Draft[] = [];

  for (const period of periods) {
    draft.push({
      id: `charge-${period.id}`,
      type: "charge",
      date: period.period_month,
      description: `Rent due — ${formatMonthLabel(period.period_month)}`,
      debit: round2(Number(period.amount_due)),
      credit: 0,
      status: "billed",
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
      rawAmount: Number(payment.amount),
    });
  }

  for (const adjustment of adjustments) {
    const delta = Number(adjustment.delta_amount);
    draft.push({
      id: `adjustment-${adjustment.id}`,
      type: "adjustment",
      date: (adjustment.confirmed_at ?? adjustment.created_at).slice(0, 10),
      description: `Adjustment — ${adjustment.reason}`,
      debit: delta < 0 ? round2(-delta) : 0,
      credit: delta > 0 ? round2(delta) : 0,
      status: adjustment.status === "confirmed" ? "confirmed" : "pending",
      refId: adjustment.id,
      rawAmount: delta,
    });
  }

  draft.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  let balance = 0;
  return draft.map((row) => {
    if (row.status !== "pending") {
      balance = round2(balance + row.debit - row.credit);
    }
    return { ...row, balance };
  });
}

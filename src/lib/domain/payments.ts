import { PAYMENT_MODES, type PaymentMode } from "@/lib/types";

/** How each payment mode reads to people: forms, the confirm page and the receipt. */
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

/** For a `<select>`: every mode in display order. */
export const PAYMENT_MODE_OPTIONS = PAYMENT_MODES.map((value) => ({ value, label: PAYMENT_MODE_LABELS[value] }));

export function isPaymentMode(value: string): value is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(value);
}

/** Never shows the raw value (`bank_transfer`); an unknown mode falls back to "Other". */
export function paymentModeLabel(mode: string): string {
  return isPaymentMode(mode) ? PAYMENT_MODE_LABELS[mode] : PAYMENT_MODE_LABELS.other;
}

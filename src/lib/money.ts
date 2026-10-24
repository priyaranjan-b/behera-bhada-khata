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

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", belowHundred(n % 100)].filter(Boolean).join(" ");
}

/** A whole number in words, Indian system: 1,23,45,678 = "One Crore Twenty Three Lakh ...". */
function integerInWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1e7);
  const parts = [
    crore ? `${integerInWords(crore)} Crore` : "",
    Math.floor((n % 1e7) / 1e5) ? `${belowHundred(Math.floor((n % 1e7) / 1e5))} Lakh` : "",
    Math.floor((n % 1e5) / 1e3) ? `${belowHundred(Math.floor((n % 1e5) / 1e3))} Thousand` : "",
    belowThousand(n % 1e3),
  ];
  return parts.filter(Boolean).join(" ");
}

/** "Rupees One Thousand Five Hundred and Fifty Paise Only", for receipts. Sign is ignored. */
export function amountInWords(value: number | string): string {
  const paiseTotal = Math.round(Math.abs(Number(value)) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  if (rupees === 0 && paise > 0) return `${belowHundred(paise)} Paise Only`;
  return `Rupees ${integerInWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
}

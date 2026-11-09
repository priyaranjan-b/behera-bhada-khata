// Phone numbers as tenants.phone stores them: E.164 (+919876543210). Client-safe.

/** The country a number typed without a code is in. */
export const DEFAULT_COUNTRY_CODE = "91";

/**
 * A typed phone number in E.164: "98765 43210", "098765-43210" and
 * "+91 98765 43210" all give "+919876543210". Anything else is returned
 * cleaned, for the schema to refuse.
 */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s().-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+${DEFAULT_COUNTRY_CODE}${cleaned}`;
  if (/^0\d{10}$/.test(cleaned)) return `+${DEFAULT_COUNTRY_CODE}${cleaned.slice(1)}`;
  if (cleaned.length === DEFAULT_COUNTRY_CODE.length + 10 && cleaned.startsWith(DEFAULT_COUNTRY_CODE)) return `+${cleaned}`;
  return cleaned;
}

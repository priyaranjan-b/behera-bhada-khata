// Reads the file name out of a Content-Disposition header, as written by
// fileResponse() in src/server/http.ts: `attachment; filename="a_b.pdf";
// filename*=UTF-8''a%20b.pdf`. The UTF-8 form wins (it keeps spaces and
// Odia); `fallback` when there is neither.

export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // Malformed percent-encoding: try the plain form instead.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header)?.[1] ?? /filename\s*=\s*([^;]+)/i.exec(header)?.[1];
  return plain?.trim() || fallback;
}

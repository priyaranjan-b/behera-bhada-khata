"use client";

import { useEffect, useState } from "react";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import LoadingButton from "@/components/ui/Loading/LoadingButton";
import { fileNameFromDisposition } from "@/lib/contentDisposition";

const PDF = "application/pdf";
/** Long enough for a cold receipt render on a slow phone connection; then "Retry share". */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Can this browser hand a PDF to another app (WhatsApp, Gmail...)? Phones mostly; most desktops can't. */
function canSharePdf(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([], "receipt.pdf", { type: PDF })] });
  } catch {
    return false;
  }
}

/**
 * Opens the phone's share sheet with the receipt PDF attached, so the owner
 * can send it straight to the tenant on WhatsApp. Renders nothing where files
 * can't be shared (the Receipt download button is still there).
 *
 * Browsers only open the share sheet shortly after a tap, and rendering the
 * PDF can take longer. If the browser refuses for that reason, the button
 * keeps the downloaded file and asks for one more tap, which shares at once.
 */
export default function ShareReceiptButton({ href, receiptNo }: { href: string; receiptNo?: string }) {
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState<File | null>(null);
  const [error, setError] = useState(false);

  // After mount: the server render has no navigator, and must match the first client render.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a browser capability once
  useEffect(() => setSupported(canSharePdf()), []);
  if (!supported) return null;

  // The receipt number and status only: never the file or a signed URL.
  function fail(stage: string, detail: unknown) {
    console.warn("Receipt share failed", { receiptNo, stage, detail });
    setError(true);
  }

  async function share() {
    setError(false);
    let file = ready;
    if (!file) {
      // A plain fetch, not `api`: the typed client returns JSON and this needs the PDF bytes.
      try {
        const response = await fetch(href, { credentials: "same-origin", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!response.ok) return fail("download", response.status);
        const fallback = `Receipt ${receiptNo ?? ""}`.trim() + ".pdf";
        const name = fileNameFromDisposition(response.headers.get("Content-Disposition"), fallback);
        file = new File([await response.blob()], name, { type: PDF });
      } catch (e) {
        return fail("download", e instanceof Error ? e.name : String(e));
      }
    }
    try {
      await navigator.share({ files: [file], title: receiptNo ? `Receipt ${receiptNo}` : "Rent receipt" });
      setReady(null);
    } catch (e) {
      const reason = e instanceof DOMException ? e.name : "";
      if (reason === "AbortError") {
        setReady(null); // The owner closed the share sheet.
      } else if (reason === "NotAllowedError") {
        setReady(file); // The tap expired while the PDF loaded: one more tap shares it.
      } else {
        fail("share", reason || String(e));
      }
    }
  }

  // The visible words start the accessible name, so it changes with them.
  const text = error ? "Retry share" : ready ? "Tap to share" : "Share";
  return (
    <LoadingButton
      size="small"
      startIcon={<ShareRoundedIcon />}
      color={error ? "error" : "primary"}
      onClick={share}
      aria-label={receiptNo ? `${text} receipt ${receiptNo}` : `${text} receipt`}
    >
      {text}
    </LoadingButton>
  );
}

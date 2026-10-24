import "server-only";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

// Payment proofs (photos, screenshots, PDFs) turned into something pdf-lib
// can place on a receipt page. pdf-lib embeds only JPEG and PNG, and the
// browser stores most photos as WebP (src/lib/proofImages.ts), so every image
// goes through sharp: auto-rotated by EXIF, scaled to fit MAX_EDGE (sharp
// enough to read a UPI screenshot when printed, small enough to keep the PDF
// light) and re-encoded as JPEG. Anything that can't be read - HEIC (sharp's
// prebuilt binaries don't decode it), an encrypted or corrupt PDF - becomes
// "unsupported" so the receipt still renders.

const MAX_EDGE = 2000;
const JPEG_QUALITY = 85;
/** A long PDF (a bank statement) shows only its first pages (page 2 has room for 6 tiles). */
export const MAX_PDF_PROOF_PAGES = 6;

export type PreparedProof =
  | { kind: "image"; jpeg: Uint8Array; width: number; height: number }
  /** `pages`: indexes of the pages that embed cleanly, at most MAX_PDF_PROOF_PAGES. */
  | { kind: "pdf"; doc: PDFDocument; pages: number[]; pageCount: number }
  | { kind: "unsupported" };

export async function prepareProof(bytes: Uint8Array, contentType: string): Promise<PreparedProof> {
  try {
    if (contentType === "application/pdf") {
      const doc = await PDFDocument.load(bytes);
      // pdf-lib only finds a page it can't embed (e.g. one with no content
      // stream) when the receipt is saved, which would fail the whole
      // receipt - so try each page in a throwaway document first.
      const probe = await PDFDocument.create();
      const pages: number[] = [];
      for (let i = 0; i < Math.min(doc.getPageCount(), MAX_PDF_PROOF_PAGES); i++) {
        try {
          const [embedded] = await probe.embedPdf(doc, [i]);
          await embedded.embed();
          pages.push(i);
        } catch {
          // Left out.
        }
      }
      return pages.length ? { kind: "pdf", doc, pages, pageCount: doc.getPageCount() } : { kind: "unsupported" };
    }
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { kind: "image", jpeg: new Uint8Array(data), width: info.width, height: info.height };
  } catch (err) {
    console.error(`receipt: can't embed a ${contentType} proof:`, err);
    return { kind: "unsupported" };
  }
}

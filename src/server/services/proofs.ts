import "server-only";
import { ApiError } from "@/lib/errors";
import type { ProofArg, ProofContentType } from "@/lib/types";
import { PROOF_LIMITS } from "@/lib/validation";
import { storage } from "@/server/infra";
import type { UploadedFile } from "./context";

// Payment proof attachments (0009_payment_proofs.sql): photos or PDFs the
// owner adds when recording a payment, stored next to the owner signature.

const EXTENSION: Record<ProofContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  bytes.length >= offset + prefix.length && prefix.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The file's real type from its first bytes, or null if it isn't one we accept. */
export function sniffProofType(bytes: Uint8Array): ProofContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  // ISO-BMFF: "ftyp" at 4, then the major brand.
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

/** A readable, storage-safe name: `3-upi-screenshot.jpg`. */
export function storageName(index: number, fileName: string, type: ProofContentType): string {
  const stem =
    fileName
      .replace(/\.[^.]*$/, "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proof";
  return `${index + 1}-${stem}.${EXTENSION[type]}`;
}

/**
 * 400 unless the files fit the limits and each really is an accepted type.
 * Shared by payment proofs and tenant documents (`what` names them in errors).
 */
export function checkProofFiles(
  files: UploadedFile[],
  what = "proof files"
): (UploadedFile & { type: ProofContentType })[] {
  if (files.length > PROOF_LIMITS.maxFiles) {
    throw new ApiError(400, `Attach at most ${PROOF_LIMITS.maxFiles} ${what} at a time`);
  }
  const total = files.reduce((sum, f) => sum + f.bytes.length, 0);
  if (total > PROOF_LIMITS.maxTotalBytes) {
    throw new ApiError(400, `${what[0].toUpperCase()}${what.slice(1)} can be at most ${PROOF_LIMITS.maxTotalBytes / 1024 / 1024} MB in total`);
  }
  return files.map((f) => {
    const type = f.bytes.length > 0 ? sniffProofType(f.bytes) : null;
    if (!type) throw new ApiError(400, `"${f.name}" isn't a photo (JPEG, PNG, WebP, HEIC) or a PDF`);
    return { ...f, type };
  });
}

/**
 * Uploads checked proofs into `<recordFolder>/proofs/`, returning the rows
 * for create_payment. If one upload fails, the ones already stored are
 * removed and it throws.
 */
export async function storeProofs(
  recordFolder: string,
  files: (UploadedFile & { type: ProofContentType })[]
): Promise<ProofArg[]> {
  const proofs: ProofArg[] = [];
  try {
    for (const [i, f] of files.entries()) {
      const path = `${recordFolder}/proofs/${storageName(i, f.name, f.type)}`;
      await storage.upload(path, f.bytes, f.type);
      proofs.push({
        storage_path: path,
        file_name: f.name.trim().slice(0, 255) || `proof-${i + 1}`,
        content_type: f.type,
        size_bytes: f.bytes.length,
      });
    }
  } catch (err) {
    console.error(err);
    await storage.remove(proofs.map((p) => p.storage_path));
    throw new ApiError(500, "Could not save the proof files");
  }
  return proofs;
}

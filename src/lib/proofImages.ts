// Browser-only: compresses photos before they're uploaded as payment proof,
// to save storage and fit several in one request (PROOF_LIMITS.maxTotalBytes).
//
// "Visually lossless": re-encoded as WebP (JPEG where the browser can't
// encode WebP) at high quality, and only scaled down past 2560px on the long
// edge - beyond what a screen or a printout of a receipt shows - so small
// text on screenshots and cheques stays sharp. The original is kept whenever
// compressing wouldn't make it smaller. Anything it can't decode (PDFs, HEIC
// outside Safari) is passed through as is.

const MAX_EDGE = 2560;
const QUALITY = 0.9;
/** Below this, re-encoding saves too little to be worth a generation of loss. */
const ALREADY_SMALL = 150 * 1024;
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** A smaller, visually identical WebP/JPEG of a photo, or the original file. */
export async function prepareProofFile(file: File): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type) || file.size <= ALREADY_SMALL) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.imageSmoothingQuality = "high";
  // Neither output keeps transparency well: put screenshots with alpha on white, not black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Browsers that can't encode WebP silently hand back a PNG instead.
  let blob = await encode(canvas, "image/webp");
  if (blob?.type !== "image/webp") blob = await encode(canvas, "image/jpeg");
  if (!blob || blob.size >= file.size) return file;

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const name = file.name.replace(/\.[^.]*$/, "") + "." + extension;
  return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

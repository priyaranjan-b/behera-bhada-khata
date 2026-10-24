// Browser-only: turns an uploaded picture of a signature (a phone photo or a
// scan of ink on paper) into a small PNG for the Profile page's saved
// signature. Scaled to fit MAX_WIDTH x MAX_HEIGHT; the paper becomes
// transparent and the ink a uniform dark blue, so it sits cleanly on the
// receipt and stays well under MAX_SIGNATURE_DATA_URL_LENGTH.

import { MAX_SIGNATURE_DATA_URL_LENGTH } from "@/lib/validation";

const MAX_WIDTH = 900;
const MAX_HEIGHT = 300;
/** Pixels lighter than this (0-255 luminance) count as paper. */
const PAPER = 175;
const INK = [26, 35, 126]; // #1A237E, the signature pad's pen colour

export async function signatureImageToPng(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't an image this browser can read. Try a JPG or PNG.");
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't process the image");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  let inked = 0;
  for (let i = 0; i < px.length; i += 4) {
    // Transparent areas of a PNG count as paper too.
    const luminance = px[i + 3] < 128 ? 255 : 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (luminance >= PAPER) {
      px[i + 3] = 0;
    } else {
      // Darker ink, more opaque: keeps the pen strokes' soft edges.
      [px[i], px[i + 1], px[i + 2]] = INK;
      px[i + 3] = Math.round(255 * Math.min(1, (PAPER - luminance) / 90));
      inked++;
    }
  }
  if (inked < 50) throw new Error("No signature found in that image - use dark ink on plain paper.");
  context.putImageData(image, 0, 0);

  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new Error("That image is too detailed. Crop it to just the signature and try again.");
  }
  return dataUrl;
}

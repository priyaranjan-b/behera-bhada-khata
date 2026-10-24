import "server-only";
// fontkit's Indic shaper (used for Odia text) needs the regenerator global.
import "regenerator-runtime/runtime";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type Color, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { addMonthsToKey, formatDateKey, formatDateTime, formatMonth } from "@/lib/dates";
import { amountInWords, formatMoney, round2 } from "@/lib/money";
import { prepareProof } from "./proofPages";

export interface ReceiptLineItem {
  label: string;
  amount: number;
  /** The rent month (yyyy-MM-01), which lets a long run of months collapse into a range. */
  periodMonth?: string;
}

/** A file attached to the payment, shown on page 2. */
export interface ReceiptProof {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface ReceiptInput {
  kind: "payment" | "adjustment";
  /** 2026/10/001, or ADJ/2026/10/001 for an adjustment (0012). */
  receiptNo: string;
  /** An adjustment: the receipt number of the payment it corrects. */
  correctsReceiptNo?: string | null;
  ownerName: string;
  /** Printed under the landlord's signature: whoever signs for the owner. */
  signatureName: string;
  tenantName: string;
  tenantBusiness?: string | null;
  propertyName: string;
  /** Houses the rent is for, e.g. ["AC-T1-G01", "AC-T1-G02"]. */
  unitCodes?: string[];
  /** Signed for an adjustment. */
  totalAmount: number;
  /** yyyy-MM-dd. */
  date: string;
  mode?: string;
  note?: string | null;
  lineItems: ReceiptLineItem[];
  ownerSignaturePng: Uint8Array;
  /** Present once the tenant has acknowledged (signed + OTP); optional since 0010. */
  tenantSignaturePng?: Uint8Array;
  otpVerifiedAt?: string;
  /** When the owner recorded it - it counts from then. */
  recordedAt: string;
  proofs?: ReceiptProof[];
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
/** Page edge to card edge, and card edge to content. */
const CARD_MARGIN = 28;
const CARD_PADDING = 32;
const LEFT = CARD_MARGIN + CARD_PADDING;
const RIGHT = PAGE_WIDTH - CARD_MARGIN - CARD_PADDING;
const WIDTH = RIGHT - LEFT;
const TOP = PAGE_HEIGHT - CARD_MARGIN - 26;
/** Lowest content baseline; below it are the page footer and the card edge. */
const BOTTOM = CARD_MARGIN + 40;

// The receipt is always one page: everything that can grow is capped.
/** Charge rows shown; more collapse into month ranges, then into "N more months". */
export const MAX_LINE_ROWS = 7;
const MAX_NOTE_LINES = 3;
const MAX_HOUSE_LINES = 2;
/** Proof tiles on page 2 (an image, or one page of a PDF each). */
export const MAX_PROOF_TILES = 6;

const hex = (value: string): Color =>
  rgb(...([1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number]));
const INK = hex("#111827");
const BODY = hex("#374151");
const MUTED = hex("#6B7280");
const NAVY = hex("#1E3A5F");
const RULE = hex("#C8D0DC");
const HAIRLINE = hex("#E2E8F0");
const BOX_FILL = hex("#F8FAFC");
const TILE_FILL = hex("#EEF1F6");

// The standard PDF fonts only cover Latin-1, so "₹" and any Odia name would
// throw. Noto Sans covers Latin + ₹; Noto Sans Oriya the Odia script. Files
// are traced into the server bundle via outputFileTracingIncludes in
// next.config.ts.
const FONT_DIR = path.join(process.cwd(), "src", "server", "pdf", "fonts");
const FONT_FILES = {
  latin: "NotoSans-Regular.ttf",
  latinBold: "NotoSans-Bold.ttf",
  odia: "NotoSansOriya-Regular.ttf",
  odiaBold: "NotoSansOriya-Bold.ttf",
} as const;

type FontKey = keyof typeof FONT_FILES;
let fontBytes: Promise<Record<FontKey, Uint8Array>> | undefined;

function loadFontBytes(): Promise<Record<FontKey, Uint8Array>> {
  fontBytes ??= Promise.all(
    (Object.keys(FONT_FILES) as FontKey[]).map(async (key) => [key, await readFile(path.join(FONT_DIR, FONT_FILES[key]))] as const)
  ).then((entries) => Object.fromEntries(entries) as unknown as Record<FontKey, Uint8Array>);
  return fontBytes;
}

interface FontPair {
  latin: PDFFont;
  odia: PDFFont;
}

const ODIA = /[଀-୿]/;

/** Splits text into runs that each render in one font: Odia vs everything else. */
export function scriptRuns(text: string): { text: string; odia: boolean }[] {
  const runs: { text: string; odia: boolean }[] = [];
  for (const char of text) {
    const odia = ODIA.test(char);
    const last = runs[runs.length - 1];
    // Spaces and punctuation stay with the run they're in.
    if (last && (last.odia === odia || /[\s\p{P}]/u.test(char))) last.text += char;
    else runs.push({ text: char, odia });
  }
  return runs;
}

function textWidth(text: string, fonts: FontPair, size: number): number {
  return scriptRuns(text).reduce((w, run) => w + (run.odia ? fonts.odia : fonts.latin).widthOfTextAtSize(run.text, size), 0);
}

function drawRuns(page: PDFPage, text: string, x: number, y: number, fonts: FontPair, size: number, color = INK) {
  let cursor = x;
  for (const run of scriptRuns(text)) {
    const font = run.odia ? fonts.odia : fonts.latin;
    page.drawText(run.text, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
}

/**
 * Greedy word wrap; the first line can be narrower (text after an inline
 * label). With `maxLines`, the last kept line ends in "…".
 */
function wrap(
  text: string,
  fonts: FontPair,
  size: number,
  maxWidth: number,
  { firstLineWidth = maxWidth, maxLines = Infinity }: { firstLineWidth?: number; maxLines?: number } = {}
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    const limit = lines.length === 0 ? firstLineWidth : maxWidth;
    if (line && textWidth(candidate, fonts, size) > limit) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && textWidth(`${last}…`, fonts, size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Letter-spaced capitals for headings (Latin only), as in the reference design. */
function trackedWidth(text: string, font: PDFFont, size: number, tracking: number): number {
  return font.widthOfTextAtSize(text, size) + tracking * Math.max(0, text.length - 1);
}

function drawTracked(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, tracking: number, color: Color) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + tracking;
  }
}

/** Fits a w x h box inside maxW x maxH, keeping its aspect ratio. */
function fit(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { width: w * scale, height: h * scale };
}

/**
 * At most `maxRows` charge rows. Runs of consecutive months at the same
 * amount become one range row ("Rent for Jun – Oct 2026 (5 months)"); if
 * that's still too many, the last row sums up the rest.
 */
export function compactLineItems(items: ReceiptLineItem[], prefix: string, maxRows = MAX_LINE_ROWS): ReceiptLineItem[] {
  if (items.length <= maxRows) return items;

  const runs: { items: ReceiptLineItem[] }[] = [];
  for (const item of items) {
    const run = runs[runs.length - 1];
    const prev = run?.items[run.items.length - 1];
    const continues =
      prev?.periodMonth &&
      item.periodMonth &&
      addMonthsToKey(prev.periodMonth, 1) === item.periodMonth &&
      round2(prev.amount) === round2(item.amount);
    if (continues) run.items.push(item);
    else runs.push({ items: [item] });
  }
  const rows = runs.map(({ items: run }) => {
    if (run.length === 1) return { ...run[0], months: 1 };
    const first = formatMonth(run[0].periodMonth!, "short");
    const last = formatMonth(run[run.length - 1].periodMonth!, "short");
    const from = first.slice(-4) === last.slice(-4) ? first.slice(0, -5) : first;
    return {
      label: `${prefix} ${from} – ${last} (${run.length} months)`,
      amount: round2(run.reduce((sum, i) => sum + i.amount, 0)),
      months: run.length,
    };
  });
  if (rows.length <= maxRows) return rows.map(({ label, amount }) => ({ label, amount }));

  const rest = rows.slice(maxRows - 1);
  const months = rest.reduce((n, r) => n + r.months, 0);
  return [
    ...rows.slice(0, maxRows - 1).map(({ label, amount }) => ({ label, amount })),
    { label: `${prefix} ${months} more months`, amount: round2(rest.reduce((sum, r) => sum + r.amount, 0)) },
  ];
}

// MenuBookRounded (Material Icons, Apache 2.0) - the app's brand icon - in a 24x24 box.
const BRAND_ICON_PATHS = [
  "M17.5 4.5c-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5-1.45 0-2.99.22-4.28.79C1.49 5.62 1 6.33 1 7.14v11.28c0 1.3 1.22 2.26 2.48 1.94.98-.25 2.02-.36 3.02-.36 1.56 0 3.22.26 4.56.92.6.3 1.28.3 1.87 0 1.34-.67 3-.92 4.56-.92 1 0 2.04.11 3.02.36 1.26.33 2.48-.63 2.48-1.94V7.14c0-.81-.49-1.52-1.22-1.85-1.28-.57-2.82-.79-4.27-.79M21 17.23c0 .63-.58 1.09-1.2.98-.75-.14-1.53-.2-2.3-.2-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5.92 0 1.83.09 2.7.28.46.1.8.51.8.98z",
  "M13.98 11.01c-.32 0-.61-.2-.71-.52-.13-.39.09-.82.48-.94 1.54-.5 3.53-.66 5.36-.45.41.05.71.42.66.83s-.42.71-.83.66c-1.62-.19-3.39-.04-4.73.39-.08.01-.16.03-.23.03m0 2.66c-.32 0-.61-.2-.71-.52-.13-.39.09-.82.48-.94 1.53-.5 3.53-.66 5.36-.45.41.05.71.42.66.83s-.42.71-.83.66c-1.62-.19-3.39-.04-4.73.39-.08.02-.16.03-.23.03m0 2.66c-.32 0-.61-.2-.71-.52-.13-.39.09-.82.48-.94 1.53-.5 3.53-.66 5.36-.45.41.05.71.42.66.83s-.42.7-.83.66c-1.62-.19-3.39-.04-4.73.39-.08.02-.16.03-.23.03",
];

function roundedRectPath(width: number, height: number, r: number): string {
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
}

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

type ProofTile =
  | { kind: "image"; caption: string; image: PDFImage }
  | { kind: "pdf"; caption: string; page: PDFEmbeddedPage }
  | { kind: "note"; caption: string; message: string };

// Page 1 is the receipt, after the reference design: a rounded card; brand and
// receipt number; tenant; a letter-spaced title; label/value rows; the
// charges; a big total with the amount in words; both signatures. Everything
// that can grow is capped (see MAX_*), so it always fits one page. Page 2,
// when the payment has proofs, shows them all as a grid.
export async function generateReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const isPayment = input.kind === "payment";
  doc.setTitle(`${isPayment ? "Rent payment receipt" : "Payment adjustment"} ${input.receiptNo}`);
  doc.setSubject(`${input.tenantName}, ${formatDateKey(input.date)}`);
  doc.setProducer("Behera Bhada Khata");

  const bytes = await loadFontBytes();
  const embed = (key: FontKey) => doc.embedFont(bytes[key], { subset: true });
  const [latin, latinBold, odia, odiaBold] = await Promise.all([
    embed("latin"),
    embed("latinBold"),
    embed("odia"),
    embed("odiaBold"),
  ]);
  const regular: FontPair = { latin, odia };
  const bold: FontPair = { latin: latinBold, odia: odiaBold };

  let page!: PDFPage;
  let y = TOP;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawSvgPath(roundedRectPath(PAGE_WIDTH - 2 * CARD_MARGIN, PAGE_HEIGHT - 2 * CARD_MARGIN, 10), {
      x: CARD_MARGIN,
      y: PAGE_HEIGHT - CARD_MARGIN,
      borderColor: HAIRLINE,
      borderWidth: 1,
    });
    y = TOP;
  };
  const text = (value: string, x: number, size: number, fonts = regular, color = INK) =>
    drawRuns(page, value, x, y, fonts, size, color);
  const textRight = (value: string, size: number, fonts = regular, color = INK) =>
    drawRuns(page, value, RIGHT - textWidth(value, fonts, size), y, fonts, size, color);
  /** A full-width rule bar below the cursor. */
  const rule = (thickness = 2.5) => {
    y -= 8;
    page.drawRectangle({ x: LEFT, y, width: WIDTH, height: thickness, color: RULE });
    y -= 8 + thickness;
  };
  /** Grey label left, value right (a wrapped value reads as a block ending at the right edge). */
  const row = (label: string, value: string, opts: { strong?: boolean; maxLines?: number } = {}) => {
    const size = 10;
    const fonts = opts.strong ? bold : regular;
    const lines = wrap(value, fonts, size, WIDTH * 0.66, { maxLines: opts.maxLines ?? 1 });
    y -= 13;
    text(label, LEFT, size, fonts, opts.strong ? BODY : MUTED);
    const blockX = RIGHT - Math.max(...lines.map((line) => textWidth(line, fonts, size)));
    lines.forEach((line, i) => {
      if (i > 0) y -= 13;
      if (lines.length === 1) textRight(line, size, fonts, INK);
      else text(line, blockX, size, fonts, INK);
    });
    y -= 4;
  };

  // ==== Page 1: the receipt ===================================================

  newPage();

  // ---- Header: brand tile + name left, receipt number + date right ----------

  const tile = 34;
  page.drawSvgPath(roundedRectPath(tile, tile, 8), { x: LEFT, y, color: TILE_FILL, borderColor: RULE, borderWidth: 0.75 });
  for (const d of BRAND_ICON_PATHS) {
    page.drawSvgPath(d, { x: LEFT + (tile - 20) / 2, y: y - (tile - 20) / 2, scale: 20 / 24, color: NAVY });
  }
  const brandX = LEFT + tile + 12;
  y -= 14;
  drawTracked(page, "BEHERA BHADA KHATA", brandX, y, latinBold, 15, 2.2, NAVY);
  textRight(`#${input.receiptNo}`, 11, regular, MUTED);
  y -= 16;
  text("ବେହେରା ଭଡ଼ା ଖାତା", brandX, 9.5, regular, MUTED);
  textRight(formatDateKey(input.date), 10, regular, MUTED);
  y -= 4;
  rule();

  // ---- Tenant -------------------------------------------------------------------

  y -= 8;
  drawTracked(page, "TENANT:", LEFT, y, latinBold, 8, 1.2, MUTED);
  const nameX = LEFT + trackedWidth("TENANT:", latinBold, 8, 1.2) + 8;
  text(wrap(input.tenantName, regular, 11.5, RIGHT - nameX, { maxLines: 1 })[0] ?? "", nameX, 11.5);
  if (input.tenantBusiness) {
    y -= 15;
    text(wrap(input.tenantBusiness, regular, 10, WIDTH, { maxLines: 1 })[0] ?? "", LEFT, 10, regular, MUTED);
  }
  rule();

  // ---- Title --------------------------------------------------------------------

  const title = isPayment ? "RENT PAYMENT RECEIPT" : "PAYMENT ADJUSTMENT";
  y -= 12;
  drawTracked(page, title, (PAGE_WIDTH - trackedWidth(title, latinBold, 13.5, 2.8)) / 2, y, latinBold, 13.5, 2.8, NAVY);
  rule();

  // ---- Details ------------------------------------------------------------------

  y += 2;
  row("Landlord", input.ownerName, { strong: true });
  row("Property", input.propertyName);
  if (input.unitCodes?.length) {
    row(input.unitCodes.length > 1 ? "Houses" : "House", input.unitCodes.join(", "), { maxLines: MAX_HOUSE_LINES });
  }
  row(isPayment ? "Payment date" : "Date", formatDateKey(input.date));
  if (input.mode) row("Payment method", MODE_LABELS[input.mode] ?? input.mode);
  if (input.correctsReceiptNo) row("Corrects receipt", `#${input.correctsReceiptNo}`);
  if (input.note) row(isPayment ? "Note" : "Reason", input.note, { maxLines: MAX_NOTE_LINES });
  rule();

  // ---- Charges ------------------------------------------------------------------

  const signed = (amount: number) =>
    isPayment ? formatMoney(amount) : `${amount < 0 ? "−" : "+"}${formatMoney(Math.abs(amount))}`;
  y -= 2;
  drawTracked(page, isPayment ? "CHARGES" : "MONTHS CHANGED", LEFT, y, latinBold, 8.5, 1.4, MUTED);
  const amountHeading = isPayment ? "AMOUNT" : "CHANGE";
  drawTracked(page, amountHeading, RIGHT - trackedWidth(amountHeading, latinBold, 8.5, 1.4), y, latinBold, 8.5, 1.4, MUTED);
  y -= 2;
  for (const item of compactLineItems(input.lineItems, isPayment ? "Rent for" : "Adjustment for")) {
    y -= 16;
    const amount = signed(item.amount);
    const labelWidth = WIDTH - textWidth(amount, regular, 10) - 16;
    text(wrap(item.label, regular, 10, labelWidth, { maxLines: 1 })[0] ?? "", LEFT, 10, regular, BODY);
    textRight(amount, 10);
  }
  rule();

  // ---- Total and amount in words ------------------------------------------------

  y -= 10;
  text(isPayment ? "TOTAL PAID" : "NET ADJUSTMENT", LEFT, 15, bold);
  textRight(signed(input.totalAmount), 15, bold);
  y -= 12;

  const label = "Amount in words: ";
  const words = `${!isPayment && input.totalAmount < 0 ? "Minus " : ""}${amountInWords(input.totalAmount)}`;
  const labelWidth = textWidth(label, bold, 9.5);
  const wordLines = wrap(words, regular, 9.5, WIDTH - 24, { firstLineWidth: WIDTH - 24 - labelWidth, maxLines: 2 });
  const boxHeight = 16 + wordLines.length * 13;
  page.drawSvgPath(roundedRectPath(WIDTH, boxHeight, 4), {
    x: LEFT,
    y,
    color: BOX_FILL,
    borderColor: HAIRLINE,
    borderWidth: 0.75,
  });
  const boxBottom = y - boxHeight;
  y -= 20;
  text(label, LEFT + 12, 9.5, bold, BODY);
  wordLines.forEach((line, i) => {
    if (i > 0) y -= 13;
    text(line, LEFT + 12 + (i === 0 ? labelWidth : 0), 9.5, regular, BODY);
  });
  y = boxBottom;
  rule();

  // ---- Signatures ---------------------------------------------------------------

  const columnWidth = 200;
  const sigHeight = 48;
  const tenantX = RIGHT - columnWidth;
  y -= 2;
  drawTracked(page, "RECEIVED BY", LEFT, y, latinBold, 8, 1.2, MUTED);
  drawTracked(page, "ACKNOWLEDGED BY", tenantX, y, latinBold, 8, 1.2, MUTED);
  y -= 6;
  const sigBottom = y - sigHeight;

  const drawSignature = async (png: Uint8Array, x: number) => {
    const image = await doc.embedPng(png);
    const box = fit(image.width, image.height, columnWidth, sigHeight);
    page.drawImage(image, { x, y: sigBottom + (sigHeight - box.height) / 2, ...box });
  };
  await drawSignature(input.ownerSignaturePng, LEFT);
  if (input.tenantSignaturePng) {
    await drawSignature(input.tenantSignaturePng, tenantX);
  } else {
    page.drawRectangle({
      x: tenantX,
      y: sigBottom,
      width: columnWidth,
      height: sigHeight,
      borderColor: RULE,
      borderWidth: 0.75,
      borderDashArray: [3, 3],
    });
    const pending = "Not yet acknowledged by the tenant";
    drawRuns(page, pending, tenantX + (columnWidth - textWidth(pending, regular, 9)) / 2, sigBottom + sigHeight / 2 - 3, regular, 9, MUTED);
  }

  y = sigBottom - 5;
  page.drawLine({ start: { x: LEFT, y }, end: { x: LEFT + columnWidth, y }, thickness: 0.75, color: MUTED });
  page.drawLine({ start: { x: tenantX, y }, end: { x: RIGHT, y }, thickness: 0.75, color: MUTED });
  y -= 13;
  text(wrap(input.signatureName, bold, 10, columnWidth, { maxLines: 1 })[0] ?? "", LEFT, 10, bold);
  text(wrap(input.tenantName, bold, 10, columnWidth, { maxLines: 1 })[0] ?? "", tenantX, 10, bold);
  y -= 12;
  const signerCaption = input.signatureName === input.ownerName ? "Landlord" : `On behalf of ${input.ownerName}`;
  text(wrap(signerCaption, regular, 8.5, columnWidth, { maxLines: 1 })[0] ?? "", LEFT, 8.5, regular, MUTED);
  const tenantCaption = input.otpVerifiedAt
    ? `Tenant · verified by SMS OTP on ${formatDateTime(input.otpVerifiedAt)}`
    : "Tenant";
  wrap(tenantCaption, regular, 8.5, columnWidth, { maxLines: 2 }).forEach((line, i) => {
    if (i > 0) y -= 11;
    text(line, tenantX, 8.5, regular, MUTED);
  });

  // ---- Footnote -----------------------------------------------------------------

  y -= 22;
  const footnote = `Recorded ${formatDateTime(input.recordedAt)} · Computer-generated receipt, signed by the landlord.`;
  text(footnote, (PAGE_WIDTH - textWidth(footnote, regular, 8)) / 2, 8, regular, MUTED);
  if (y < BOTTOM) console.error(`receipt ${input.receiptNo}: page 1 overflows by ${Math.round(BOTTOM - y)}pt`);

  // ==== Page 2: payment proofs, as a grid ========================================

  const proofs = input.proofs ?? [];
  if (proofs.length) {
    const tiles: ProofTile[] = [];
    for (const proof of proofs) {
      const prepared = await prepareProof(proof.bytes, proof.contentType);
      if (prepared.kind === "image") {
        tiles.push({ kind: "image", caption: proof.fileName, image: await doc.embedJpg(prepared.jpeg) });
      } else if (prepared.kind === "pdf") {
        // proofPages.ts already embedded these pages once, so saving can't fail on them.
        const pages = await doc.embedPdf(prepared.doc, prepared.pages);
        pages.forEach((p, i) => {
          const caption = prepared.pageCount > 1 ? `${proof.fileName} · page ${prepared.pages[i] + 1}` : proof.fileName;
          tiles.push({ kind: "pdf", caption, page: p });
        });
      } else {
        const type = proof.contentType.split("/")[1]?.toUpperCase() ?? "This";
        tiles.push({ kind: "note", caption: proof.fileName, message: `${type} file - open it in the app` });
      }
    }
    const shown = tiles.slice(0, MAX_PROOF_TILES);

    newPage();
    drawTracked(page, "PAYMENT PROOF", LEFT, y, latinBold, 12, 2, NAVY);
    textRight(`#${input.receiptNo}`, 10, regular, MUTED);
    y -= 15;
    const summary =
      tiles.length > shown.length
        ? `${shown.length} of ${tiles.length} shown - see the payment in the app for the rest`
        : `${proofs.length} ${proofs.length === 1 ? "attachment" : "attachments"}`;
    text(summary, LEFT, 9, regular, MUTED);
    rule(2);

    const gap = 12;
    const captionHeight = 14;
    const cols = shown.length === 1 ? 1 : 2;
    const rows = Math.ceil(shown.length / cols);
    const tileWidth = (WIDTH - gap * (cols - 1)) / cols;
    const tileHeight = (y - BOTTOM - gap * (rows - 1)) / rows;
    const gridTop = y;

    shown.forEach((tileItem, i) => {
      const x = LEFT + (i % cols) * (tileWidth + gap);
      const top = gridTop - Math.floor(i / cols) * (tileHeight + gap);
      const caption = wrap(tileItem.caption, regular, 8.5, tileWidth, { maxLines: 1 })[0] ?? "";
      drawRuns(page, caption, x, top - 9, regular, 8.5, MUTED);
      const area = { x, y: top - tileHeight, width: tileWidth, height: tileHeight - captionHeight };
      page.drawRectangle({ ...area, color: BOX_FILL, borderColor: HAIRLINE, borderWidth: 0.75 });

      const inner = { x: area.x + 6, y: area.y + 6, width: area.width - 12, height: area.height - 12 };
      const place = (w: number, h: number) => {
        const box = fit(w, h, inner.width, inner.height);
        return { x: inner.x + (inner.width - box.width) / 2, y: inner.y + (inner.height - box.height) / 2, ...box };
      };
      if (tileItem.kind === "image") {
        page.drawImage(tileItem.image, place(tileItem.image.width, tileItem.image.height));
      } else if (tileItem.kind === "pdf") {
        const box = place(tileItem.page.width, tileItem.page.height);
        // A white backing: a PDF page without its own background would show the tile through.
        page.drawRectangle({ ...box, color: rgb(1, 1, 1), borderColor: HAIRLINE, borderWidth: 0.5 });
        page.drawPage(tileItem.page, box);
      } else {
        const width = textWidth(tileItem.message, regular, 9.5);
        drawRuns(page, tileItem.message, inner.x + (inner.width - width) / 2, inner.y + inner.height / 2, regular, 9.5, BODY);
      }
    });
  }

  // ---- Page footers -------------------------------------------------------------

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = `Receipt #${input.receiptNo}  ·  Page ${i + 1} of ${pages.length}`;
    p.drawText(footer, {
      x: (PAGE_WIDTH - latin.widthOfTextAtSize(footer, 8)) / 2,
      y: CARD_MARGIN + 14,
      size: 8,
      font: latin,
      color: MUTED,
    });
  });

  return doc.save();
}

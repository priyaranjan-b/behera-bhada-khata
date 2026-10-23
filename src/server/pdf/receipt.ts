import "server-only";
// fontkit's Indic shaper (used for Odia text) needs the regenerator global.
import "regenerator-runtime/runtime";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export interface ReceiptLineItem {
  label: string;
  amount: number;
}

export interface ReceiptInput {
  title: string;
  recordId: string;
  ownerName: string;
  tenantName: string;
  propertyName: string;
  /** Houses the rent is for, e.g. ["AC-T1-G01", "AC-T1-G02"]. */
  unitCodes?: string[];
  totalAmount: number;
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
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TEXT = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.3, 0.3, 0.3);

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

function drawRuns(page: PDFPage, text: string, x: number, y: number, fonts: FontPair, size: number, color = TEXT) {
  let cursor = x;
  for (const run of scriptRuns(text)) {
    const font = run.odia ? fonts.odia : fonts.latin;
    page.drawText(run.text, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
}

/** Greedy word wrap to `maxWidth`. */
function wrap(text: string, fonts: FontPair, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, fonts, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${input.title} ${input.recordId}`);

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

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const left = MARGIN;
  const right = PAGE_WIDTH - MARGIN;
  const lineHeight = 18;
  let y = PAGE_HEIGHT - MARGIN;

  const drawLine = (text: string, opts: { size?: number; useBold?: boolean; x?: number } = {}) => {
    drawRuns(page, text, opts.x ?? left, y, opts.useBold ? bold : regular, opts.size ?? 11);
    y -= lineHeight;
  };
  const drawAmount = (amount: number, useBold = false) => {
    const fonts = useBold ? bold : regular;
    const text = formatMoney(amount);
    // Right-aligned on the line just drawn.
    drawRuns(page, text, right - textWidth(text, fonts, 11), y + lineHeight, fonts, 11);
  };

  drawLine(input.title, { size: 18, useBold: true });
  y -= 4;
  drawLine(`Record ID: ${input.recordId}`, { size: 9 });
  drawLine(`Property: ${input.propertyName}`);
  if (input.unitCodes?.length) {
    for (const line of wrap(`Houses: ${input.unitCodes.join(", ")}`, regular, 11, right - left)) drawLine(line);
  }
  drawLine(`Tenant: ${input.tenantName}`);
  drawLine(`Owner: ${input.ownerName}`);
  drawLine(`Date: ${input.date}`);
  if (input.mode) drawLine(`Mode: ${input.mode.replace(/_/g, " ")}`);
  y -= 8;

  drawLine("Breakdown", { useBold: true });
  for (const item of input.lineItems) {
    drawLine(item.label, { x: left + 10 });
    drawAmount(item.amount);
  }
  y -= 4;
  drawLine("Total", { useBold: true });
  drawAmount(input.totalAmount, true);

  if (input.note) {
    y -= 4;
    for (const line of wrap(`Note: ${input.note}`, regular, 10, right - left)) drawLine(line, { size: 10 });
  }

  y -= 20;
  drawLine("Signatures", { useBold: true });
  y -= 10;

  const signatureWidth = 180;
  const signatureHeight = 60;

  const ownerSigImage = await doc.embedPng(input.ownerSignaturePng);
  page.drawImage(ownerSigImage, { x: left, y: y - signatureHeight, width: signatureWidth, height: signatureHeight });
  drawRuns(page, "Owner", left, y - signatureHeight - 14, regular, 10, MUTED);

  const tenantX = right - signatureWidth;
  if (input.tenantSignaturePng) {
    const tenantSigImage = await doc.embedPng(input.tenantSignaturePng);
    page.drawImage(tenantSigImage, { x: tenantX, y: y - signatureHeight, width: signatureWidth, height: signatureHeight });
  } else {
    page.drawRectangle({
      x: tenantX,
      y: y - signatureHeight,
      width: signatureWidth,
      height: signatureHeight,
      borderColor: MUTED,
      borderWidth: 0.5,
      borderDashArray: [3, 3],
    });
    drawRuns(page, "Not yet signed by the tenant", tenantX + 12, y - signatureHeight / 2 - 3, regular, 9, MUTED);
  }
  drawRuns(page, "Tenant", tenantX, y - signatureHeight - 14, regular, 10, MUTED);

  y -= signatureHeight + 34;
  drawLine(`Recorded at: ${formatDateTime(input.recordedAt)}`, { size: 9 });
  if (input.otpVerifiedAt) {
    drawLine(`Acknowledged by the tenant, identity verified via SMS OTP at: ${formatDateTime(input.otpVerifiedAt)}`, {
      size: 9,
    });
  }

  return doc.save();
}

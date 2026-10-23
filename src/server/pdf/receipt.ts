import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  totalAmount: number;
  date: string;
  mode?: string;
  note?: string | null;
  lineItems: ReceiptLineItem[];
  ownerSignaturePng: Uint8Array;
  tenantSignaturePng: Uint8Array;
  otpVerifiedAt: string;
  confirmedAt: string;
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

export async function generateReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;
  const left = MARGIN;
  const lineHeight = 18;

  const drawText = (text: string, opts: { size?: number; useBold?: boolean; x?: number } = {}) => {
    page.drawText(text, {
      x: opts.x ?? left,
      y,
      size: opts.size ?? 11,
      font: opts.useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  };

  drawText(input.title, { size: 18, useBold: true });
  y -= 4;
  drawText(`Record ID: ${input.recordId}`, { size: 9 });
  drawText(`Property: ${input.propertyName}`);
  drawText(`Tenant: ${input.tenantName}`);
  drawText(`Owner: ${input.ownerName}`);
  drawText(`Date: ${input.date}`);
  if (input.mode) drawText(`Mode: ${input.mode}`);
  y -= 8;

  drawText("Breakdown", { useBold: true });
  for (const item of input.lineItems) {
    drawText(`${item.label}`, { x: left + 10 });
    page.drawText(formatMoney(item.amount), {
      x: PAGE_WIDTH - MARGIN - 80,
      y: y + lineHeight,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  y -= 4;
  drawText(`Total: ${formatMoney(input.totalAmount)}`, { useBold: true });

  if (input.note) {
    y -= 4;
    drawText(`Note: ${input.note}`, { size: 10 });
  }

  y -= 20;
  drawText("Signatures", { useBold: true });
  y -= 10;

  const signatureWidth = 180;
  const signatureHeight = 60;

  const ownerSigImage = await doc.embedPng(input.ownerSignaturePng);
  page.drawImage(ownerSigImage, { x: left, y: y - signatureHeight, width: signatureWidth, height: signatureHeight });
  page.drawText("Owner", { x: left, y: y - signatureHeight - 14, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

  const tenantSigImage = await doc.embedPng(input.tenantSignaturePng);
  const tenantX = PAGE_WIDTH - MARGIN - signatureWidth;
  page.drawImage(tenantSigImage, { x: tenantX, y: y - signatureHeight, width: signatureWidth, height: signatureHeight });
  page.drawText("Tenant", { x: tenantX, y: y - signatureHeight - 14, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

  y -= signatureHeight + 34;
  drawText(`Tenant identity verified via SMS OTP at: ${input.otpVerifiedAt}`, { size: 9 });
  drawText(`Confirmed at: ${input.confirmedAt}`, { size: 9 });

  return doc.save();
}

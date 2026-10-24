import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { compactLineItems, generateReceiptPdf, MAX_LINE_ROWS, scriptRuns, type ReceiptInput } from "./receipt";

// Smallest valid PNG: 1x1 transparent pixel.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

// "Asha Mohanty" and "Priyaranjan Behera" in Odia script.
const ODIA_TENANT = "ଆଶା ମହାନ୍ତି";
const ODIA_OWNER = "ପ୍ରିୟରଞ୍ଜନ ବେହେରା";

const receipt: ReceiptInput = {
  kind: "payment",
  receiptNo: "2026/03/001",
  ownerName: ODIA_OWNER,
  signatureName: ODIA_OWNER,
  tenantName: ODIA_TENANT,
  tenantBusiness: "Lotus Prints",
  propertyName: "Behera Bhawan",
  unitCodes: ["AC-T1-G01", "AC-T1-G02"],
  totalAmount: 12500.5,
  date: "2026-03-05",
  mode: "bank_transfer",
  note: `Paid for two months, thanks ${ODIA_TENANT}. `.repeat(3),
  lineItems: [
    { label: "Rent for January 2026", amount: 6250.25 },
    { label: "Rent for February 2026", amount: 6250.25 },
  ],
  ownerSignaturePng: PNG,
  tenantSignaturePng: PNG,
  otpVerifiedAt: "2026-03-05T04:00:00Z",
  recordedAt: "2026-03-05T04:00:05Z",
};

/** Two pages with content, plus a blank one (no content stream) that pdf-lib can't embed. */
async function proofPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]).drawText("Bank slip", { x: 20, y: 360 });
  doc.addPage([400, 300]).drawText("Page 2", { x: 20, y: 260 });
  doc.addPage([400, 300]);
  return doc.save();
}

describe("generateReceiptPdf", () => {
  it("renders rupee amounts and Odia names (the standard PDF fonts can't) on one page", async () => {
    const bytes = await generateReceiptPdf(receipt);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Rent payment receipt 2026/03/001");
    expect(bytes.length).toBeLessThan(200_000); // fonts are subset
  });

  it("stays on one page however much it has to show", async () => {
    const errors = vi.spyOn(console, "error");
    const lineItems = Array.from({ length: 24 }, (_, i) => ({ label: `Rent for month ${i + 1}`, amount: 500 + i }));
    const doc = await PDFDocument.load(
      await generateReceiptPdf({
        ...receipt,
        kind: "adjustment",
        correctsReceiptNo: "2026/03/001",
        tenantName: `${ODIA_TENANT} `.repeat(8),
        tenantBusiness: "A very long business name ".repeat(6),
        propertyName: "Arnapal Chakk Complex, Tower 1; Arnapal Chakk Complex, Tower 2",
        unitCodes: Array.from({ length: 30 }, (_, i) => `AC-T1-${100 + i}`),
        note: "A very long note about this payment. ".repeat(20),
        lineItems,
        totalAmount: 123456789.99,
      })
    );
    expect(doc.getPageCount()).toBe(1);
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining("overflows"));
  });

  it("shows every proof on one page 2: images, PDF pages, and a note for a file it can't show", async () => {
    const webp = new Uint8Array(
      await sharp({ create: { width: 1200, height: 2400, channels: 3, background: "#3366aa" } }).webp().toBuffer()
    );
    const bytes = await generateReceiptPdf({
      ...receipt,
      tenantSignaturePng: undefined,
      otpVerifiedAt: undefined,
      proofs: [
        { fileName: "upi.webp", contentType: "image/webp", bytes: webp },
        { fileName: "cheque.png", contentType: "image/png", bytes: PNG },
        { fileName: "bank.pdf", contentType: "application/pdf", bytes: await proofPdf() },
        { fileName: "photo.heic", contentType: "image/heic", bytes: new Uint8Array([1, 2, 3]) },
      ],
    });
    // Receipt + one page of proofs (WebP, PNG, the PDF's two pages with content, the HEIC note).
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("titles an adjustment with its own number", async () => {
    const bytes = await generateReceiptPdf({
      ...receipt,
      kind: "adjustment",
      receiptNo: "ADJ/2026/03/001",
      correctsReceiptNo: "2026/03/001",
      totalAmount: -500,
      mode: undefined,
      lineItems: [{ label: "Adjustment for January 2026", amount: -500 }],
    });
    expect((await PDFDocument.load(bytes)).getTitle()).toBe("Payment adjustment ADJ/2026/03/001");
  });
});

describe("compactLineItems", () => {
  const month = (m: number, amount = 1000) => ({
    label: `Rent for month ${m}`,
    amount,
    periodMonth: `2026-${String(m).padStart(2, "0")}-01`,
  });

  it("leaves a short list alone", () => {
    const items = [month(1), month(2), month(3)];
    expect(compactLineItems(items, "Rent for")).toBe(items);
  });

  it("collapses runs of consecutive months at the same amount into ranges", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8].map((m) => month(m)).concat([month(9, 1200), month(10, 1200), month(12, 1200)]);
    expect(compactLineItems(items, "Rent for")).toEqual([
      { label: "Rent for Jan – Aug 2026 (8 months)", amount: 8000 },
      { label: "Rent for Sept – Oct 2026 (2 months)", amount: 2400 },
      { label: "Rent for month 12", amount: 1200 },
    ]);
  });

  it("sums whatever doesn't fit into the last row", () => {
    const items = Array.from({ length: 12 }, (_, i) => month(i + 1, 1000 + i));
    const rows = compactLineItems(items, "Rent for");
    expect(rows).toHaveLength(MAX_LINE_ROWS);
    expect(rows[MAX_LINE_ROWS - 1]).toEqual({ label: "Rent for 6 more months", amount: 6051 });
  });
});

describe("scriptRuns", () => {
  it("splits Odia from Latin, keeping spaces and punctuation in the current run", () => {
    expect(scriptRuns(`Tenant: ${ODIA_TENANT}, Room 4`)).toEqual([
      { text: "Tenant: ", odia: false },
      { text: `${ODIA_TENANT}, `, odia: true },
      { text: "Room 4", odia: false },
    ]);
  });
});

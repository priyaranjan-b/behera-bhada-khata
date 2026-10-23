import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateReceiptPdf, scriptRuns } from "./receipt";

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

describe("generateReceiptPdf", () => {
  it("renders rupee amounts and Odia names (the standard PDF fonts can't)", async () => {
    const bytes = await generateReceiptPdf({
      title: "Rent Payment Receipt",
      recordId: "rec-1",
      ownerName: ODIA_OWNER,
      tenantName: ODIA_TENANT,
      propertyName: "Behera Bhawan",
      totalAmount: 12500.5,
      date: "2026-03-05",
      mode: "bank_transfer",
      note: `Paid for two months, thanks ${ODIA_TENANT}. `.repeat(10),
      lineItems: [
        { label: "Rent for January 2026", amount: 6250.25 },
        { label: "Rent for February 2026", amount: 6250.25 },
      ],
      ownerSignaturePng: PNG,
      tenantSignaturePng: PNG,
      otpVerifiedAt: "2026-03-05T04:00:00Z",
      recordedAt: "2026-03-05T04:00:05Z",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(bytes.length).toBeLessThan(200_000); // fonts are subset
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

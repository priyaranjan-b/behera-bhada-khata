import { describe, expect, it } from "vitest";
import { fileNameFromDisposition } from "./contentDisposition";

describe("fileNameFromDisposition", () => {
  it("prefers the UTF-8 name", () => {
    expect(
      fileNameFromDisposition(`attachment; filename="Receipt_2026_10_001.pdf"; filename*=UTF-8''Receipt%202026%2F10%2F001.pdf`, "x.pdf")
    ).toBe("Receipt 2026/10/001.pdf");
  });

  it("falls back to the quoted name", () => {
    expect(fileNameFromDisposition(`attachment; filename="Receipt_001.pdf"`, "x.pdf")).toBe("Receipt_001.pdf");
  });

  it("reads an unquoted name", () => {
    expect(fileNameFromDisposition(`attachment; filename=receipt.pdf`, "x.pdf")).toBe("receipt.pdf");
  });

  it("uses the quoted name when the UTF-8 form is malformed", () => {
    expect(fileNameFromDisposition(`attachment; filename="ok.pdf"; filename*=UTF-8''%E0%A4`, "x.pdf")).toBe("ok.pdf");
  });

  it("returns the fallback without a header or name", () => {
    expect(fileNameFromDisposition(null, "x.pdf")).toBe("x.pdf");
    expect(fileNameFromDisposition("attachment", "x.pdf")).toBe("x.pdf");
  });
});

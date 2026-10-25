import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, columnLetter, crc32, escapeXml, sheetName } from "./xlsx";

/** Reads the stored entries back out of the zip, checking each CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    expect(view.getUint16(at + 8, true)).toBe(0); // stored
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(crc).toBe(nodeCrc32(data));
    files.set(name, decoder.decode(data));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(files.size);
  return files;
}

describe("buildXlsx", () => {
  const files = unzip(
    buildXlsx({
      name: "Tenants: Oct/2026",
      header: ["Tenant", "Outstanding", "Note"],
      rows: [
        ["Rao & Sons <shop>", 12500, null],
        ["ଓଡ଼ିଆ ନାମ", 999.5, "  spaced  "],
      ],
    })
  );

  it("writes every part of the package", () => {
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Tenants  Oct 2026"');
  });

  it("writes a bold header, escaped text and typed numbers", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Tenant</t></is></c>');
    expect(sheet).toContain("Rao &amp; Sons &lt;shop&gt;");
    expect(sheet).toContain('<c r="B2" s="2"><v>12500</v></c>');
    expect(sheet).toContain('<c r="B3" s="3"><v>999.5</v></c>');
    expect(sheet).toContain("ଓଡ଼ିଆ ନାମ");
    expect(sheet).toContain('<t xml:space="preserve">  spaced  </t>');
    expect(sheet).not.toContain('r="C2"'); // empty cell left out
    expect(sheet).toContain('state="frozen"');
  });
});

describe("xlsx helpers", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("names columns like Excel", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("cleans sheet names", () => {
    expect(sheetName("a/b:c")).toBe("a b c");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName(" [] ")).toBe("Sheet1");
  });

  it("escapes XML and drops control characters", () => {
    expect(escapeXml(`a"b\u0001c&`)).toBe("a&quot;bc&amp;");
  });
});

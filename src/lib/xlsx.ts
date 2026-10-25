// A minimal .xlsx writer: one sheet, a bold frozen header row, text and number
// cells. Enough for the table downloads without pulling in a spreadsheet
// library (MUI X only exports Excel in its Premium plan). An .xlsx file is a
// zip of a few XML parts; entries are stored uncompressed, which Excel and
// LibreOffice accept.

export type XlsxCell = string | number | null;

export interface XlsxSheet {
  /** Sheet tab name; trimmed to Excel's 31 characters and stripped of `[]:*?/\`. */
  name: string;
  header: string[];
  rows: XlsxCell[][];
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Style indexes into cellXfs in STYLES_XML.
const STYLE = { header: 1, integer: 2, decimal: 3 } as const;
const COLUMN_WIDTH = { min: 8, max: 60 } as const;

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES_XML =
  XML_HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  XML_HEAD +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

const WORKBOOK_RELS_XML =
  XML_HEAD +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  "</Relationships>";

// cellXfs: 0 default, 1 bold header, 2 "#,##0" (built-in 3), 3 "#,##0.00" (built-in 4).
const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/** Builds the .xlsx file for one sheet. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  return zipStored([
    ["[Content_Types].xml", CONTENT_TYPES_XML],
    ["_rels/.rels", ROOT_RELS_XML],
    ["xl/workbook.xml", workbookXml(sheetName(sheet.name))],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS_XML],
    ["xl/styles.xml", STYLES_XML],
    ["xl/worksheets/sheet1.xml", worksheetXml(sheet)],
  ]);
}

/** A valid, non-empty sheet tab name. */
export function sheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31).trim();
  return cleaned || "Sheet1";
}

/** Zero-based column index -> Excel column letters (0 -> A, 26 -> AA). */
export function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

function workbookXml(name: string): string {
  return (
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>"
  );
}

function worksheetXml({ header, rows }: XlsxSheet): string {
  const widths = header.map((h, i) =>
    Math.min(
      COLUMN_WIDTH.max,
      Math.max(COLUMN_WIDTH.min, h.length + 2, ...rows.map((r) => displayLength(r[i] ?? null) + 2))
    )
  );
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const headerRow = rowXml(1, header, STYLE.header);
  const bodyRows = rows.map((row, i) => rowXml(i + 2, row)).join("");
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}">` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    "</sheetView></sheetViews>" +
    cols +
    `<sheetData>${headerRow}${bodyRows}</sheetData>` +
    "</worksheet>"
  );
}

function rowXml(rowNumber: number, cells: XlsxCell[], textStyle?: number): string {
  const xml = cells
    .map((value, i) => {
      const ref = `${columnLetter(i)}${rowNumber}`;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return "";
        const style = Number.isInteger(value) ? STYLE.integer : STYLE.decimal;
        return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      }
      if (value === null || value === "") return "";
      const style = textStyle === undefined ? "" : ` s="${textStyle}"`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    })
    .join("");
  return `<row r="${rowNumber}">${xml}</row>`;
}

function displayLength(value: XlsxCell): number {
  if (value === null) return 0;
  if (typeof value === "number") {
    // As shown: "#,##0" or "#,##0.00".
    const digits = Math.floor(Math.abs(value)).toString().length;
    return digits + Math.floor((digits - 1) / 3) + (Number.isInteger(value) ? 0 : 3) + (value < 0 ? 1 : 0);
  }
  return Math.max(...value.split("\n").map((line) => line.length));
}

/** Escapes text for XML and drops the control characters XML 1.0 can't hold. */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- zip (stored entries only) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest DOS date: entries carry no meaningful time.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;

function zipStored(files: [name: string, content: string][]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_NAMES, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_NAMES, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // extra, comment, disk, internal and external attributes stay 0
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

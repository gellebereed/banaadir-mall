/**
 * ─────────────────────────────────────────────────────────────────────────
 *  XLSX — a small, dependency-free reader for supplier spreadsheets.
 * ─────────────────────────────────────────────────────────────────────────
 * An .xlsx file is a ZIP of XML parts. Everything an import needs lives in
 * four of them:
 *
 *   xl/workbook.xml        sheet names, and the 1900/1904 date epoch
 *   xl/_rels/…rels         which part holds which sheet
 *   xl/sharedStrings.xml   every distinct string, referenced by index
 *   xl/worksheets/sheetN   the cells themselves
 *
 * WHY NOT A LIBRARY. The obvious candidates are either unmaintained on npm
 * or an order of magnitude larger than this file, and both would be carried
 * into every deploy for one admin screen. Reading a spreadsheet that Excel
 * itself wrote is a narrow, stable problem: the parts above have not changed
 * shape since 2007.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. Formulas are read as their cached
 * result (which is what a supplier's file always carries), formatting is
 * ignored, and ZIP64 archives are rejected with a clear message rather than
 * mis-parsed. Node only — it needs zlib.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { inflateRawSync } from "node:zlib";

export interface Sheet {
  name: string;
  /** Row-major grid of cell text. Ragged rows are padded to equal width. */
  rows: string[][];
}

// ── ZIP ────────────────────────────────────────────────────────────────

const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Extract the archive into a name → bytes map.
 *
 * The central directory is read rather than the local headers alone,
 * because a local header is allowed to leave the sizes at zero and defer
 * them to a data descriptor after the payload — in which case the only
 * trustworthy sizes are the central directory's.
 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  // The EOCD sits at the very end unless the archive has a comment, which
  // may be up to 64 KB. Scan backwards over that window.
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 0x10000 - 22);
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("That file is not a valid .xlsx workbook (no ZIP directory found).");
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  if (cursor === 0xffffffff) {
    throw new Error("ZIP64 workbooks are not supported. Re-save the file as .xlsx or .csv.");
  }

  const files = new Map<string, Buffer>();

  for (let entry = 0; entry < entryCount; entry++) {
    if (cursor + 46 > buffer.length) break;

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    cursor += 46 + nameLength + extraLength + commentLength;

    // Directory entries carry no payload.
    if (name.endsWith("/")) continue;
    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) continue;

    // The local header's own name/extra lengths differ from the central
    // directory's — the extra field routinely does — so read them again.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);

    try {
      files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    } catch {
      // One unreadable part (a thumbnail, a stray macro) must not sink the
      // import — the sheet we need may still be intact.
    }
  }

  return files;
}

// ── XML ────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(text: string): string {
  if (!text.includes("&")) return text;
  return text
    .replace(/&(lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    // Ampersand LAST, so "&amp;lt;" decodes to "&lt;" and not "<".
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

/** Concatenated text of every <t> element — this is how rich text arrives. */
function textRuns(xml: string): string {
  let out = "";
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += match[1];
  return decodeXml(out);
}

// ── Shared strings ─────────────────────────────────────────────────────

function readSharedStrings(files: Map<string, Buffer>): string[] {
  const part = files.get("xl/sharedStrings.xml");
  if (!part) return [];

  const xml = part.toString("utf8");
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)) {
    strings.push(match[1] === undefined ? "" : textRuns(match[1]));
  }
  return strings;
}

// ── Dates ──────────────────────────────────────────────────────────────

/** Excel's built-in date/time number formats. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Which cell styles mean "this number is a date".
 *
 * A date in a spreadsheet is just a number — 46184 — and only the style
 * says otherwise. Without this the invoice date imports as "46184", which
 * is the kind of value that reaches a customer-facing screen before anyone
 * notices.
 */
function readDateStyles(files: Map<string, Buffer>): Set<number> {
  const part = files.get("xl/styles.xml");
  const dateStyles = new Set<number>();
  if (!part) return dateStyles;

  const xml = part.toString("utf8");

  // Custom formats first: their ids are what cellXfs will reference.
  const customDateFormats = new Set<number>();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attribute(match[1], "numFmtId"));
    const code = attribute(match[1], "formatCode") ?? "";
    // Strip literals and colour/condition brackets before looking for date
    // letters, so a currency format like [$-409]#,##0.00 isn't mistaken for
    // one containing a "d".
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (Number.isFinite(id) && /[ymdhs]/i.test(bare)) customDateFormats.add(id);
  }

  const cellXfs = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  let index = 0;
  for (const match of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const numFmtId = Number(attribute(match[1], "numFmtId") ?? "0");
    if (BUILTIN_DATE_FORMATS.has(numFmtId) || customDateFormats.has(numFmtId)) {
      dateStyles.add(index);
    }
    index++;
  }

  return dateStyles;
}

/**
 * Excel serial → ISO date.
 *
 * The 1900 system counts from 1899-12-30 rather than 1900-01-01, because
 * Excel deliberately keeps Lotus 1-2-3's phantom 29 February 1900.
 */
export function excelSerialToIso(serial: number, use1904 = false): string {
  const epoch = use1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 86400000));
  if (Number.isNaN(date.getTime())) return String(serial);
  return date.toISOString().slice(0, 10);
}

// ── Cells ──────────────────────────────────────────────────────────────

/** "BC" → 54. Column letters are base-26 with no zero. */
function columnIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function readSheet(
  xml: string,
  shared: string[],
  dateStyles: Set<number>,
  use1904: boolean,
): string[][] {
  const rows: string[][] = [];
  let width = 0;

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    // A cell may legally omit its reference, in which case it simply
    // follows the previous one.
    let nextColumn = 0;

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";

      const ref = attribute(attrs, "r");
      const column = ref ? columnIndex(ref.replace(/\d+/g, "")) : nextColumn;
      nextColumn = column + 1;

      const type = attribute(attrs, "t");
      let value = "";

      if (type === "inlineStr") {
        value = textRuns(body);
      } else if (type === "s") {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        value = raw === undefined ? "" : shared[Number(raw)] ?? "";
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) {
          const text = decodeXml(raw);
          if (type === "b") {
            value = text === "1" ? "TRUE" : "FALSE";
          } else if (type === "e") {
            // #N/A and friends: an error is not data, and passing the text
            // through would import "#REF!" as a product name.
            value = "";
          } else {
            const style = Number(attribute(attrs, "s") ?? "-1");
            const numeric = Number(text);
            value =
              dateStyles.has(style) && Number.isFinite(numeric) && numeric > 0
                ? excelSerialToIso(numeric, use1904)
                : text;
          }
        }
      }

      // Fill any columns the file skipped because they were empty.
      while (cells.length < column) cells.push("");
      cells[column] = value;
    }

    // Rows are keyed by their own r attribute; a gap means blank rows that
    // still have to occupy their positions, or the grid shifts upward.
    const rowNumber = Number(attribute(rowMatch[1], "r") ?? String(rows.length + 1));
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
    width = Math.max(width, cells.length);
  }

  for (const row of rows) {
    while (row.length < width) row.push("");
  }

  return rows;
}

// ── Workbook ───────────────────────────────────────────────────────────

/**
 * Read every worksheet in the workbook, in the order Excel shows its tabs.
 */
export function readXlsx(buffer: Buffer): Sheet[] {
  const files = unzip(buffer);

  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8");
  if (!workbookXml) {
    throw new Error("That file is not a valid .xlsx workbook (no workbook part).");
  }

  const use1904 = /date1904="(1|true)"/.test(workbookXml);
  const shared = readSharedStrings(files);
  const dateStyles = readDateStyles(files);

  // relationship id → part name, e.g. rId1 → worksheets/sheet1.xml
  const relationships = new Map<string, string>();
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attribute(match[1], "Id");
    const target = attribute(match[1], "Target");
    if (id && target) relationships.set(id, target.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attribute(match[1], "name") ?? `Sheet${sheets.length + 1}`;
    const relationshipId = attribute(match[1], "r:id") ?? attribute(match[1], "id");
    const target = relationshipId ? relationships.get(relationshipId) : undefined;

    const part =
      (target && files.get(`xl/${target}`)) ??
      files.get(`xl/worksheets/sheet${sheets.length + 1}.xml`);
    if (!part) continue;

    sheets.push({
      name,
      rows: readSheet(part.toString("utf8"), shared, dateStyles, use1904),
    });
  }

  if (sheets.length === 0) {
    throw new Error("That workbook has no readable sheets.");
  }

  return sheets;
}

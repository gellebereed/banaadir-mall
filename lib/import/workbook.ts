/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 1 — turn an uploaded file into labelled columns and data rows.
 * ─────────────────────────────────────────────────────────────────────────
 * Everything downstream works on `{ headers, rows }`, so this is the only
 * module that knows whether the supplier sent .xlsx or .csv.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parseCsv } from "./csv.ts";
import { readXlsx, type Sheet } from "./xlsx.ts";

export interface SheetTable {
  name: string;
  /** Column labels, in file order. Never blank, never duplicated. */
  headers: string[];
  /** Data rows below the header, each padded to headers.length. */
  rows: string[][];
  /** Which spreadsheet row the header was found on (1-based, for messages). */
  headerRow: number;
}

const NUMERIC = /^-?[\d\s.,]+%?$/;

/**
 * Find the header row.
 *
 * Suppliers put a title, a logo, or a blank line above the real header —
 * and an importer that assumes row 1 then offers "Untitled", "Column B"
 * as the columns to map. The header is the first row that is mostly
 * non-numeric text and about as wide as the widest row: a data row fails
 * the first test, a stray title row fails the second.
 */
function findHeaderRow(rows: string[][]): number {
  const width = Math.max(0, ...rows.slice(0, 50).map((row) => row.filter(Boolean).length));
  if (width === 0) return 0;

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const filled = rows[i].filter((cell) => cell.trim() !== "");
    if (filled.length < 2 || filled.length < width * 0.6) continue;

    const wordy = filled.filter((cell) => !NUMERIC.test(cell.trim())).length;
    if (wordy >= filled.length * 0.7) return i;
  }
  return 0;
}

/**
 * Make labels safe to show in a dropdown and to key a mapping by: a blank
 * column becomes "Column D", and a repeated name gets a suffix so the two
 * are distinguishable rather than silently interchangeable.
 */
function labelColumns(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, index) => {
    const base = cell.trim() || `Column ${columnLetter(index)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let out = "";
  let n = index;
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function toTable(sheet: Sheet): SheetTable {
  const headerRow = findHeaderRow(sheet.rows);
  const rawHeaders = sheet.rows[headerRow] ?? [];
  const headers = labelColumns(rawHeaders);

  const rows = sheet.rows
    .slice(headerRow + 1)
    .map((row) => {
      const padded = headers.map((_, i) => (row[i] ?? "").trim());
      return padded;
    })
    // A trailing run of empty rows is normal in a hand-edited sheet and
    // would otherwise import as hundreds of blank products.
    .filter((row) => row.some((cell) => cell !== ""));

  return { name: sheet.name, headers, rows, headerRow: headerRow + 1 };
}

/** True for names this reader handles. */
export function isSupportedFile(filename: string): boolean {
  return /\.(xlsx|xlsm|csv|tsv|txt)$/i.test(filename);
}

/**
 * Read an uploaded file into one table per sheet. CSV yields exactly one.
 */
export function readTables(bytes: Buffer, filename: string): SheetTable[] {
  const name = filename.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    const rows = parseCsv(bytes.toString("utf8"));
    return [toTable({ name: "Sheet1", rows })];
  }

  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    throw new Error(
      "That is the old .xls format. Open it in Excel and use Save As → " +
        "Excel Workbook (.xlsx), or CSV.",
    );
  }

  return readXlsx(bytes).map(toTable).filter((table) => table.headers.length > 0);
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 1 (b) — Odoo's "Variant Values" column → one column per attribute.
 * ─────────────────────────────────────────────────────────────────────────
 * Export product.product from Odoo with "Variant Values" ticked and the
 * attributes do not arrive as columns. They arrive as a one-to-many field,
 * which Odoo writes one value per ROW:
 *
 *   Barcode        Internal Reference  Name           Variant Values  Qty
 *   8683689172637  4A0100000002        Classic Pants  color: BLACK      0
 *                                                     size: 52
 *                                                     brand: AC&CO
 *
 * Read as it stands, that is three products: one with a colour and no
 * size, then two "blank" rows that the aggregator skips. In the 8,120-row
 * export this was written against, 3,609 rows vanished that way and every
 * colour and size of a style collapsed into one variant-less product.
 *
 * So, before anything else sees the table:
 *
 *   1. a row that is empty except for the variant column is folded into
 *      the row above it — it is the rest of that variant, not a new one;
 *   2. each "name: value" pair becomes a column named after the attribute
 *      ("Color", "Size", "Brand"), which the schema then maps by name like
 *      any other header.
 *
 * The seller does nothing: the file is recognised by its shape, and a file
 * that does not have that shape passes through untouched.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { normalizeHeader } from "./schema.ts";

/** The shape of the part of a SheetTable this step rewrites. */
interface Rows {
  headers: string[];
  rows: string[][];
  rowNumbers: number[];
}

/** "color: BLACK", "Size : 52" — an attribute name, a colon, a value. */
const PAIR = /^([^:,]{1,40}?)\s*:\s*(.+)$/;

/**
 * Odoo names the column "Variant Values" (product.product) or "Attribute
 * Values" / "Product Attribute Values" depending on version and model.
 * The header test keeps a description column that merely happens to hold
 * "Material: cotton" from being mistaken for one.
 */
const HEADER = /\b(VARIANT|ATTRIBUTE)S?\b.*\bVALUES?\b|^VALUES$/;

/** At least this share of the column's filled cells must be pairs. */
const PAIR_SHARE = 0.8;

/**
 * Split one cell into its pairs. Most exports put one pair per row, but a
 * "Variant Values / Display Name" export joins them — "Color: Black, Size:
 * M" — so a comma followed by another "name:" starts a new pair. A comma
 * inside a value ("Size: 1,5") is left alone because no colon follows it.
 */
function pairsIn(cell: string): [string, string][] {
  return cell
    .split(/,\s*(?=[^,:]{1,40}:)/)
    .map((part) => PAIR.exec(part.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1].trim(), match[2].trim()]);
}

function findVariantColumn(table: Rows): number {
  return table.headers.findIndex((header, column) => {
    if (!HEADER.test(normalizeHeader(header))) return false;
    const filled = table.rows.map((row) => row[column]).filter(Boolean);
    if (filled.length === 0) return false;
    const pairs = filled.filter((cell) => pairsIn(cell).length > 0).length;
    return pairs >= filled.length * PAIR_SHARE;
  });
}

/** "color" → "Color", "PRODUCT SIZE" → "Product Size". */
function attributeLabel(name: string): string {
  return name.toLowerCase().replace(/(^|[\s_/-])\p{L}/gu, (s) => s.toUpperCase());
}

/**
 * Rewrite the table if it carries an Odoo variant-values column; otherwise
 * return it as it came.
 */
export function expandVariantValues<T extends Rows>(table: T): T {
  const variantColumn = findVariantColumn(table);
  if (variantColumn < 0) return table;

  // ── 1. Fold continuation rows into the variant they belong to ────────
  const records: { cells: string[]; row: number; pairs: [string, string][] }[] = [];
  table.rows.forEach((cells, index) => {
    const pairs = pairsIn(cells[variantColumn] ?? "");
    const continuation =
      records.length > 0 && cells.every((cell, column) => column === variantColumn || cell === "");
    if (continuation) records[records.length - 1].pairs.push(...pairs);
    else records.push({ cells, row: table.rowNumbers[index], pairs });
  });

  // ── 2. One column per attribute, in the order the file introduces them ─
  const kept = table.headers.filter((_, column) => column !== variantColumn);
  const existing = new Map(kept.map((header, column) => [normalizeHeader(header), column]));
  /** Normalised attribute name → its column in the output. */
  const columns = new Map<string, number>();
  const headers = [...kept];

  for (const record of records) {
    for (const [name] of record.pairs) {
      const key = normalizeHeader(name);
      if (!key || columns.has(key)) continue;
      // A file that has a real "Brand" column AND a brand attribute gets
      // one column, the attribute filling the gaps — two columns with the
      // same meaning would leave the mapping to pick one at random.
      const column = existing.get(key) ?? headers.push(attributeLabel(name)) - 1;
      columns.set(key, column);
    }
  }

  const rows = records.map((record) => {
    const cells = record.cells.filter((_, column) => column !== variantColumn);
    while (cells.length < headers.length) cells.push("");
    for (const [name, value] of record.pairs) {
      const column = columns.get(normalizeHeader(name));
      // First value wins: Odoo lists each attribute once per variant, so a
      // second one is a stray, not something to overwrite with.
      if (column !== undefined && cells[column] === "") cells[column] = value;
    }
    return cells;
  });

  return { ...table, headers, rows, rowNumbers: records.map((record) => record.row) };
}

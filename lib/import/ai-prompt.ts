/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE AI PROMPT — for sellers who reshape their file with ChatGPT & co.
 * ─────────────────────────────────────────────────────────────────────────
 * Sellers already do this: they drop their export and our template into an
 * AI chat and ask it to "make this look like that". Asked that loosely, the
 * tool guesses — it summarises 8,000 rows into 200, invents barcodes for
 * the rows that had none, renames "Quantity *" to "Qty", and turns
 * 8683689172637 into 8.68E+12. Every one of those imports, and imports
 * wrong.
 *
 * So the wizard hands them a prompt that says exactly what the importer
 * needs. It is built from IMPORT_FIELDS and templateRows(), the same list
 * that drives the template and the auto-detection, so a field added to the
 * schema shows up here too and the headers the AI is told to write are
 * always the ones the importer recognises.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { IDENTITY_FIELDS, IMPORT_FIELDS, templateRows } from "./schema.ts";

export function aiConversionPrompt(): string {
  const headers = templateRows()[0];
  const ordered = [
    ...IMPORT_FIELDS.filter((f) => f.required),
    ...IMPORT_FIELDS.filter((f) => !f.required),
  ];

  const columns = ordered
    .map((field, index) => {
      const example = field.examples.find(Boolean);
      return (
        `- "${headers[index]}" — ${field.hint}` +
        (example ? ` Example: ${example}` : "")
      );
    })
    .join("\n");

  const identity = IMPORT_FIELDS.filter((f) => IDENTITY_FIELDS.includes(f.key))
    .map((f) => `"${f.label}"`)
    .join(", ");

  return `I have attached two files:
1. MY FILE — my product list, exported from my own system.
2. THE TEMPLATE — "banaadir-product-import-template.csv", the format I need.

Convert MY FILE into the format of THE TEMPLATE, so I can upload it to an online marketplace. Accuracy matters more than anything: these are real products, prices and stock levels.

OUTPUT
- One CSV file (UTF-8, comma-separated) I can download.
- The header row must be EXACTLY these columns, in this order, spelled exactly as written (including the " *"):
${headers.join(",")}
- Delete THE TEMPLATE's three example rows. They are only examples.

WHAT EACH COLUMN MEANS
${columns}

RULES
1. One row per sellable item — one colour + size combination. Every colour and size of the same product shares the same "Product code".
2. If MY FILE spreads one item over several rows (for example a "Variant Values" column with "color: BLACK" on one row and "size: 52" on the blank row below it), merge them into one row. If one cell holds several attributes ("Color: Black, Size: M"), split them into the right columns.
3. Never invent data. If MY FILE does not contain a value, leave that cell empty. Do not make up barcodes, codes, prices, quantities, colours or sizes, and do not guess a category.
4. Every row needs at least one of ${identity}.
5. Copy codes and barcodes exactly as text. Keep leading zeros. Never write them in scientific notation (8.68E+12) or add decimals (8683689172637.0).
6. Numbers: plain digits with a dot for decimals — no currency symbols, no thousands separators. "Quantity *" is a whole number; if it is missing, write 0.
7. Dates as YYYY-MM-DD.
8. Keep text as it is. Do not translate, shorten or rewrite product names, colours or categories.
9. Keep EVERY product row from MY FILE. Do not summarise, sample, drop or merge rows (except the continuation rows in rule 2). If the file is large, process all of it with code rather than reading it by eye. If you cannot process the whole file, tell me — never hand back a partial file without saying so.
10. Columns in MY FILE that match nothing in the template: leave them out. Template columns MY FILE cannot fill: keep the header and leave the cells empty.

WHEN YOU ARE DONE, tell me:
- which column of MY FILE you used for each template column,
- how many rows MY FILE had and how many rows the CSV has (and why they differ, if they do),
- anything you were unsure about or left empty.`;
}

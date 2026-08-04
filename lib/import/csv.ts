/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CSV — RFC 4180 parsing, with the concessions Excel actually requires.
 * ─────────────────────────────────────────────────────────────────────────
 * Suppliers send "CSV" that is really semicolon-separated (any Excel
 * installed in a comma-decimal locale saves it that way), often with a BOM,
 * and occasionally tab-separated with a .csv extension. Guessing the
 * delimiter from the header line costs ten lines here and saves a support
 * conversation that starts "the importer put everything in one column".
 * ─────────────────────────────────────────────────────────────────────────
 */

const DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * The delimiter that splits the first non-empty line into the most fields.
 * Counted OUTSIDE quotes, so a comma inside "Jacket, navy" doesn't win the
 * vote for a semicolon-separated file.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";

  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) count++;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text into a grid of raw strings. Quoted fields may contain the
 * delimiter, newlines, and doubled quotes ("" → ").
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  // A UTF-8 BOM survives into the first header name, turning "ITEM" into
  // "﻿ITEM" — which then matches no synonym and looks like a missing
  // column to the user.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let touched = false;

  const endField = () => {
    row.push(field);
    field = "";
    touched = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      // Swallow CR; the LF that follows ends the row.
    } else {
      field += char;
    }
  }

  // A file not ending in a newline still has one last row in the buffer.
  if (field !== "" || touched || row.length > 0) endRow();

  return rows;
}

/** Quote a value only when it would otherwise break the row. */
export function csvCell(value: string | number | undefined | null): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialise a grid to CSV text with a BOM so Excel opens it as UTF-8. */
export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  BARCODES & INTERNAL REFERENCES — validation shared by client and server.
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors how Odoo treats the two product identity fields:
 *
 *   Odoo `barcode`       → the scannable GTIN printed on the packaging.
 *                          Unique across every sellable unit (product.product).
 *   Odoo `default_code`  → the "Internal Reference" the company assigns.
 *                          Free-form, but the natural key everyone imports on.
 *
 * A GTIN is a fixed-length numeric code whose LAST digit is a mod-10 check
 * digit. Odoo warns when it doesn't add up; we go one step further and
 * reject it, because a wrong check digit is always a typo — the scanner
 * would never produce one, so accepting it guarantees the code can never be
 * scanned in the warehouse.
 *
 * Codes that are not GTIN-shaped at all (e.g. "KRC-TENC-24") are accepted as
 * INTERNAL barcodes, exactly like Odoo's default nomenclature does. Many
 * suppliers here label goods with their own scheme and that must keep working.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Barcode families we recognise. GTIN-8/12/13/14 map onto the symbologies a
 * retail scanner emits; INTERNAL is any other non-empty code.
 */
export type BarcodeSymbology =
  | "EAN-8"
  | "UPC-A"
  | "EAN-13"
  | "ITF-14"
  | "INTERNAL";

/** Digit counts that carry a GS1 mod-10 check digit, and what to call them. */
const GTIN_LENGTHS: Record<number, BarcodeSymbology> = {
  8: "EAN-8",
  12: "UPC-A",
  13: "EAN-13",
  14: "ITF-14",
};

/**
 * Invisible characters that survive `.trim()`: zero-width space, BOM and
 * non-breaking space. Codes pasted from Excel or a supplier's PDF routinely
 * carry them, and the result looks identical on screen while never matching
 * anything — so they are normalised away before any comparison.
 */
const INVISIBLE = /[​‌‍﻿ ]/g;

export interface BarcodeCheck {
  /** Trimmed value, or "" when nothing was entered. */
  value: string;
  /** False only for codes that are certainly wrong (bad GTIN check digit). */
  valid: boolean;
  symbology: BarcodeSymbology | null;
  /** Reason the code was rejected, ready to show to the seller. */
  error?: string;
  /**
   * Advisory note for codes that are accepted but unusual — e.g. a numeric
   * code of a length no retail scanner emits.
   */
  warning?: string;
  /** The check digit the entered digits imply, for "did you mean…" hints. */
  suggestion?: string;
}

/**
 * Strip the characters scanners and spreadsheets add around a code.
 * Keyboard-wedge scanners append a newline; exported CSVs often carry
 * non-breaking spaces and hyphenated GTIN groupings ("8 691 106 123 456").
 */
export function normalizeBarcode(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").replace(INVISIBLE, " ").trim();
  if (!trimmed) return "";
  // Only strip separators when what remains is purely numeric — otherwise a
  // deliberate internal code like "KRC-TENC-24" would be mangled.
  const stripped = trimmed.replace(/[\s-]/g, "");
  return /^\d+$/.test(stripped) ? stripped : trimmed;
}

/**
 * GS1 mod-10 check digit: sum the digits right-to-left with alternating
 * weights of 3 and 1, then take what's needed to reach the next multiple
 * of ten. Same algorithm for GTIN-8, 12, 13 and 14.
 */
export function gtinCheckDigit(digitsWithoutCheck: string): string {
  let sum = 0;
  // The rightmost position before the check digit always carries weight 3.
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Validate a barcode the way Odoo's nomenclature does, but stricter on GTINs. */
export function checkBarcode(raw: string | null | undefined): BarcodeCheck {
  const value = normalizeBarcode(raw);
  if (!value) return { value: "", valid: true, symbology: null };

  if (!/^\d+$/.test(value)) {
    // A free-form internal code. Odoo stores these happily; we only guard
    // against characters that break CSV export and label printing.
    if (!/^[A-Za-z0-9._\-/]+$/.test(value)) {
      return {
        value,
        valid: false,
        symbology: null,
        error:
          "Barcodes may only contain letters, numbers and . _ - / — remove spaces and symbols.",
      };
    }
    return {
      value,
      valid: true,
      symbology: "INTERNAL",
      warning:
        "Not a standard EAN/UPC barcode. It will be stored as an internal code — fine for your own labels, but retail scanners expect 8, 12, 13 or 14 digits.",
    };
  }

  const symbology = GTIN_LENGTHS[value.length];
  if (!symbology) {
    return {
      value,
      valid: true,
      symbology: "INTERNAL",
      warning: `${value.length} digits is not a retail barcode length (EAN-8, UPC-A 12, EAN-13, ITF-14). Stored as an internal code.`,
    };
  }

  const expected = gtinCheckDigit(value.slice(0, -1));
  if (expected !== value.slice(-1)) {
    return {
      value,
      valid: false,
      symbology,
      error: `Invalid ${symbology} check digit — the last digit should be ${expected}, not ${value.slice(-1)}. Re-scan or re-type the code.`,
      suggestion: value.slice(0, -1) + expected,
    };
  }

  return { value, valid: true, symbology };
}

/** Convenience wrapper for server-side guards. */
export function isValidBarcode(raw: string | null | undefined): boolean {
  return checkBarcode(raw).valid;
}

/**
 * Internal references (Odoo `default_code`) are upper-cased and have inner
 * whitespace collapsed to a hyphen, so "krc tenc 24" and "KRC-TENC-24"
 * can't both exist — that ambiguity is what makes an Odoo import create
 * duplicate products instead of matching the existing one.
 */
export function normalizeReference(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(INVISIBLE, " ")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
}

export interface ReferenceCheck {
  value: string;
  valid: boolean;
  error?: string;
}

export function checkReference(raw: string | null | undefined): ReferenceCheck {
  const value = normalizeReference(raw);
  if (!value) return { value: "", valid: true };
  if (value.length > 64) {
    return { value, valid: false, error: "Internal reference is limited to 64 characters." };
  }
  if (!/^[A-Z0-9._\-/]+$/.test(value)) {
    return {
      value,
      valid: false,
      error:
        "Internal references may only contain letters, numbers and . _ - / (e.g. KRC-TENC-24).",
    };
  }
  return { value, valid: true };
}

/**
 * Suggest a reference for a product that has none — vendor initials plus a
 * short name stem, in the shape most Odoo catalogues already use.
 * e.g. ("karaca-home", "Tencere Seti") → "KAR-TENCERE-SETI".
 */
export function suggestReference(storeSlug: string, productName: string): string {
  const prefix = normalizeReference(storeSlug).replace(/[^A-Z0-9]/g, "").slice(0, 3) || "BM";
  const stem = normalizeReference(productName)
    .replace(/[^A-Z0-9-]/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 3)
    .join("-");
  return [prefix, stem].filter(Boolean).join("-").slice(0, 64);
}

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
 * ─────────────────────────────────────────────────────────────────────────
 */

export type BarcodeSymbology =
  | "EAN-8"
  | "UPC-A"
  | "EAN-13"
  | "ITF-14"
  | "INTERNAL";

const GTIN_LENGTHS: Record<number, BarcodeSymbology> = {
  8: "EAN-8",
  12: "UPC-A",
  13: "EAN-13",
  14: "ITF-14",
};

const INVISIBLE = /[​‌‍﻿ ]/g;

export interface BarcodeCheck {
  value: string;
  valid: boolean;
  symbology: BarcodeSymbology | null;
  error?: string;
  warning?: string;
  suggestion?: string;
}

/**
 * Strip the characters scanners, Excel, and PDFs add around a code.
 * Strips hardware scanner preambles (e.g. ]C1), zero-width spaces, and bad symbols.
 */
export function normalizeBarcode(raw: string | null | undefined): string {
  if (!raw) return "";
  let trimmed = String(raw)
    .replace(/^\][A-Za-z0-9]{2}/, "")
    .replace(INVISIBLE, " ")
    .trim();
  if (!trimmed) return "";

  // Pure numeric GTIN / barcode
  const stripped = trimmed.replace(/[\s:-]/g, "");
  if (/^\d+$/.test(stripped)) return stripped;

  // Sanitize internal non-numeric code so symbols like # @ & become clean dashes
  return trimmed
    .replace(/[^A-Za-z0-9._\-/]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** GS1 mod-10 check digit calculation. */
export function gtinCheckDigit(digitsWithoutCheck: string): string {
  let sum = 0;
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Validate & auto-fix a barcode so saves are robust. */
export function checkBarcode(raw: string | null | undefined): BarcodeCheck {
  const value = normalizeBarcode(raw);
  if (!value) return { value: "", valid: true, symbology: null };

  if (!/^\d+$/.test(value)) {
    return {
      value,
      valid: true,
      symbology: "INTERNAL",
      warning: "Stored as an internal code.",
    };
  }

  const symbology = GTIN_LENGTHS[value.length];
  if (!symbology) {
    return {
      value,
      valid: true,
      symbology: "INTERNAL",
      warning: `${value.length} digits — stored as an internal code.`,
    };
  }

  const expected = gtinCheckDigit(value.slice(0, -1));
  if (expected !== value.slice(-1)) {
    const fixedValue = value.slice(0, -1) + expected;
    return {
      value: fixedValue, // Auto-correct check digit on save
      valid: true,
      symbology,
      warning: `Auto-corrected ${symbology} check digit from ${value.slice(-1)} to ${expected}.`,
      suggestion: fixedValue,
    };
  }

  return { value, valid: true, symbology };
}

export function isValidBarcode(raw: string | null | undefined): boolean {
  return checkBarcode(raw).valid;
}

/**
 * Normalise internal references (Odoo default_code): upper-cased, whitespace & symbols to hyphens.
 */
export function normalizeReference(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(INVISIBLE, " ")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._\-/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export interface ReferenceCheck {
  value: string;
  valid: boolean;
  error?: string;
}

export function checkReference(raw: string | null | undefined): ReferenceCheck {
  const value = normalizeReference(raw);
  if (!value) return { value: "", valid: true };
  return { value, valid: true };
}

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

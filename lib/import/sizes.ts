/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 2 (c) — sizes, in wearing order.
 * ─────────────────────────────────────────────────────────────────────────
 * Variants come out of a spreadsheet in whatever order the invoice printed
 * them, and anything that sorts them afterwards sorts alphabetically:
 * 3XL, L, M, S, XL, XXL. That reads as broken to a shopper, and it makes
 * "is my size in stock" a hunt instead of a glance.
 *
 * ── DROP is not a size ───────────────────────────────────────────────────
 * Suits and jackets carry a drop code (6N, 4N) — the difference between
 * chest and waist measurement. It is part of the supplier's variant code,
 * but it never distinguishes two variants that share a colour and size:
 * checked against the real file, folding it into the key merges exactly
 * zero variants. So it belongs in the LABEL a customer reads and in the
 * SKU that must round-trip to the supplier, and nowhere else. Treating it
 * as a third axis would double the variant count with phantom rows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cleanText, deturkify } from "./text.ts";

/** Letter sizes, smallest first. Index doubles as the sort key. */
const LETTER_ORDER = [
  "XXXS", "XXS", "XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL",
  "XXL", "3XL", "4XL", "5XL", "6XL",
];

/** Spellings that mean an existing letter size. */
const LETTER_ALIASES: Record<string, string> = {
  "2XL": "XXL",
  "2XS": "XXS",
  "3XS": "XXXS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  "X-LARGE": "XL",
  "XX-LARGE": "XXL",
  "X-SMALL": "XS",
};

/** One-size markers. STN is Turkish "standart". */
const ONE_SIZE = new Set(["STN", "STD", "STANDART", "STANDARD", "ONE SIZE", "ONESIZE", "TEK", "U", "OS"]);

export interface ResolvedSize {
  /** Canonical value stored on the variant, e.g. "XXL", "50", "One size". */
  value: string;
  /** What the customer reads, including any drop: "50 · 6 Drop". */
  label: string;
  /** Sort key: letter sizes below 1000, numeric sizes above, one-size last. */
  order: number;
}

export function resolveSize(rawSize: string | undefined, rawDrop?: string): ResolvedSize | undefined {
  const size = deturkify(cleanText(rawSize)).toUpperCase();
  const drop = deturkify(cleanText(rawDrop)).toUpperCase();

  if (!size && !drop) return undefined;

  const canonical = LETTER_ALIASES[size] ?? size;

  if (!size) {
    // A drop with no size is not something we can label sensibly.
    return undefined;
  }

  if (ONE_SIZE.has(canonical)) {
    return { value: "One size", label: "One size", order: 100_000 };
  }

  const letterIndex = LETTER_ORDER.indexOf(canonical);
  if (letterIndex >= 0) {
    return {
      value: canonical,
      label: withDrop(canonical, drop),
      order: letterIndex,
    };
  }

  const numeric = Number(canonical.replace(",", "."));
  if (Number.isFinite(numeric)) {
    return {
      value: canonical,
      label: withDrop(canonical, drop),
      // Offset past the letter block so numeric sizes never interleave
      // with letter ones — no product mixes the two anyway.
      order: 1000 + numeric,
    };
  }

  // Unrecognised but real (e.g. "32/34"). Keep it, sort it after the
  // known ones rather than dropping the variant.
  return { value: canonical, label: withDrop(canonical, drop), order: 50_000 };
}

/** "50" + "6N" → "50 · 6 Drop". */
function withDrop(size: string, drop: string): string {
  if (!drop) return size;
  const digits = drop.match(/\d+/)?.[0];
  return digits ? `${size} · ${digits} Drop` : `${size} · ${drop}`;
}

/** Sort variants into wearing order — colour first, then size. */
export function compareSizes(a: ResolvedSize | undefined, b: ResolvedSize | undefined): number {
  return (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER);
}

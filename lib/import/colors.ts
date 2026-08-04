/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 2 (b) — colour names → swatches.
 * ─────────────────────────────────────────────────────────────────────────
 * `Variant.colorHex` drives the colour circles on the product page. Without
 * a value there the page falls back to grey dots, and a shirt that comes in
 * eleven colours becomes eleven identical grey dots — the customer has to
 * click each one to find out what it is.
 *
 * Supplier colour names are not CSS colours ("MINK", "SAFARI", "PRUSSIAN
 * NAVY", "POMEGRANATE"), so they need a dictionary. Compound names
 * ("BLACK WHITE", "BRICK-BEIGE") are real multi-colour prints: we take the
 * first recognised colour for the swatch and flag the variant so a
 * merchandiser can put a photo on it, rather than pretending a two-tone
 * fabric is one flat colour.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cleanText, deturkify, titleCase } from "./text.ts";

/** Base colours, keyed by the English name suppliers actually write. */
const SWATCHES: Record<string, string> = {
  BLACK: "#141414",
  WHITE: "#ffffff",
  ECRU: "#f0e9da",
  CREAM: "#f5efe0",
  IVORY: "#f7f3e8",
  GREY: "#9ca3af",
  "LIGHT GREY": "#d1d5db",
  "DARK GREY": "#4b5563",
  ANTHRACITE: "#383e42",
  SILVER: "#c0c4c8",
  NAVY: "#1e3a5f",
  "PRUSSIAN NAVY": "#1b2a4a",
  BLUE: "#2563eb",
  "LIGHT BLUE": "#93c5fd",
  "ROYAL BLUE": "#1d4ed8",
  INDIGO: "#3f4a8a",
  SAX: "#7ba7d4",
  TURQUOISE: "#40c4c4",
  PETROL: "#2c5f6f",
  "DARK PETROL": "#1e4653",
  GREEN: "#16a34a",
  "DARK GREEN": "#14532d",
  "LIGHT GREEN": "#86efac",
  MINT: "#a7f3d0",
  KHAKI: "#7a7a52",
  OLIVE: "#6b7043",
  SAFARI: "#a89968",
  BEIGE: "#e3d5b8",
  "LIGHT BEIGE": "#efe6d2",
  STONE: "#d6cbb8",
  SAND: "#e0d2b4",
  CAMEL: "#c19a6b",
  TAN: "#cba07a",
  MINK: "#a08878",
  BROWN: "#6b4f3a",
  "DARK BROWN": "#4a3527",
  BURGUNDY: "#7b1f2b",
  POMEGRANATE: "#9b2242",
  CLARET: "#8b2233",
  RED: "#dc2626",
  BRICK: "#a44a3f",
  ORANGE: "#ea7317",
  YELLOW: "#f5c518",
  MUSTARD: "#d4a017",
  GOLD: "#c9a227",
  PINK: "#f4a7bb",
  "SALMON PINK": "#f2a2a0",
  SALMON: "#f4a08a",
  "DUSTY ROSE": "#c9a0a6",
  FUCHSIA: "#d6216f",
  PURPLE: "#7e22ce",
  LILAC: "#c4b5fd",
  MIXED: "#8b8b8b",
};

/**
 * Colour words that arrive untranslated, plus the "melange"/"vert" style
 * modifiers that describe a finish rather than a different colour.
 */
const COLOR_TERMS: Record<string, string> = {
  KARISIK: "MIXED",
  HARDAL: "MUSTARD",
  SIYAH: "BLACK",
  BEYAZ: "WHITE",
  LACIVERT: "NAVY",
  GRI: "GREY",
  MAVI: "BLUE",
  KIRMIZI: "RED",
  YESIL: "GREEN",
  SARI: "YELLOW",
  BORDO: "BURGUNDY",
  KAHVE: "BROWN",
  VIZON: "MINK",
  PEMBE: "PINK",
  TURUNCU: "ORANGE",
  MOR: "PURPLE",
  BEJ: "BEIGE",
};

/** Words that qualify a colour without changing which colour it is. */
const MODIFIERS = new Set(["MELANGE", "VERT", "MELANJ", "TONE", "TONES", "PRINT", "PRINTED"]);

/** Longest keys first so "LIGHT BLUE" is tried before "BLUE". */
const SWATCH_KEYS = Object.keys(SWATCHES).sort(
  (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length,
);

export interface ResolvedColor {
  /** Customer-facing name, e.g. "Prussian Navy". */
  name: string;
  /** Swatch colour, or undefined when the name is not recognised. */
  hex?: string;
  /** True when the name lists more than one colour — a print or two-tone. */
  multi: boolean;
}

/**
 * Resolve a supplier colour name into a display name and a swatch.
 *
 * `BLACK HARDAL WHITE` → { name: "Black Mustard White", hex: black, multi }
 * `MINK`               → { name: "Mink", hex: #a08878, multi: false }
 * `ZEBRA`              → { name: "Zebra", hex: undefined, multi: false }
 */
export function resolveColor(raw: string | undefined): ResolvedColor | undefined {
  const cleaned = cleanText(raw);
  if (!cleaned) return undefined;

  // Hyphens and slashes separate colours in these files, not words.
  const words = deturkify(cleaned)
    .toUpperCase()
    .replace(/[-/,&+]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => COLOR_TERMS[word] ?? word);

  const meaningful = words.filter((word) => !MODIFIERS.has(word));
  const phrase = meaningful.join(" ");

  // Exact whole-name match first — "LIGHT BLUE" must not resolve to BLUE.
  if (SWATCHES[phrase]) {
    return { name: displayName(words), hex: SWATCHES[phrase], multi: false };
  }

  // Otherwise walk left to right, greedily taking the longest known colour
  // at each position, so we learn both the first colour (the swatch) and
  // how many distinct colours the name mentions.
  const found: string[] = [];
  for (let i = 0; i < meaningful.length; ) {
    const match = SWATCH_KEYS.find((key) => {
      const parts = key.split(" ");
      return parts.every((part, offset) => meaningful[i + offset] === part);
    });
    if (match) {
      found.push(match);
      i += match.split(" ").length;
    } else {
      i++;
    }
  }

  const distinct = new Set(found);
  return {
    name: displayName(words),
    hex: found[0] ? SWATCHES[found[0]] : undefined,
    multi: distinct.size > 1,
  };
}

/**
 * "BLACK-BLACK" and "NAVY NAVY" are how these files write a single-colour
 * item whose fabric and trim match. Repeating the word in the swatch label
 * just looks like a bug, so collapse runs of the same colour.
 */
function displayName(words: string[]): string {
  const collapsed = words.filter((word, index) => word !== words[index - 1]);
  return titleCase(collapsed.join(" "));
}

/** Every recognised colour name, for the wizard's "unmatched colours" list. */
export function isKnownColor(raw: string | undefined): boolean {
  return resolveColor(raw)?.hex !== undefined;
}

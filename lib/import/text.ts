/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 2 (a) — text that came out of a Turkish ERP.
 * ─────────────────────────────────────────────────────────────────────────
 * Two problems, both of which reach the customer if they are not handled
 * here.
 *
 * THE DOTTED I. Turkish has two i's: dotted (i/İ) and dotless (ı/I).
 * JavaScript's toLowerCase() does not know that, so "TAKIM ELBİSE"
 * lowercases to "elbi̇se" — an i followed by a COMBINING DOT ABOVE, which
 * renders as a smudge and sorts and searches as a different word. Mapping
 * the Turkish letters to ASCII before changing case avoids it entirely.
 *
 * UNTRANSLATED TERMS. Supplier exports leak Turkish into columns that are
 * otherwise English: CEKET, TAKIM ELBİSE, POLİESTER. Left alone, "Ceket"
 * ships as a product name to customers reading English and Somali.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Values that mean "blank" but are not blank. */
const BLANK_VALUES = new Set(["", "-", "--", "N/A", "NA", "NULL", "NONE", "(EMPTY)", "(BLANK)", "."]);

/** Trim, collapse runs of whitespace, and treat placeholder text as empty. */
export function cleanText(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  const text = String(raw).replace(/[​-‍﻿ ]/g, " ").replace(/\s+/g, " ").trim();
  return BLANK_VALUES.has(text.toUpperCase()) ? "" : text;
}

/** Turkish letters → ASCII, so case operations behave. */
export function deturkify(text: string): string {
  return text
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o");
}

/**
 * Turkish terms that appear in English columns, and what they mean.
 * Longest first at match time, so "CEKET GOMLEK" is not translated as
 * "Jacket GOMLEK".
 */
const TERMS: Record<string, string> = {
  "TAKIM ELBISE": "Suit",
  "CEKET GOMLEK": "Shirt Jacket",
  "PANTOLON YAN CEP BELI LASTIKLI": "Elasticated Waist Side Pocket Trousers",
  "PAPYON&KUSAK": "Bow Tie & Cummerbund",
  "PAPYON KUSAK": "Bow Tie & Cummerbund",
  PANTOLON: "Trousers",
  CEKET: "Jacket",
  GOMLEK: "Shirt",
  ELBISE: "Dress",
  KUSAK: "Cummerbund",
  PAPYON: "Bow Tie",
  KRAVAT: "Tie",
  CANTA: "Bag",
  AYAKKABI: "Shoes",
  CORAP: "Socks",
  KEMER: "Belt",
  KAZAK: "Jumper",
  MONT: "Coat",
  SORT: "Shorts",
  ESOFMAN: "Tracksuit",
  // Fabric names, which appear inside composition strings.
  POLIESTER: "Polyester",
  POLYESTER: "Polyester",
  POLIAMID: "Polyamide",
  POLYAMID: "Polyamide",
  PAMUK: "Cotton",
  YUN: "Wool",
  KETEN: "Linen",
  VISKON: "Viscose",
  SUET: "Suede",
  NUBUK: "Nubuck",
  DERI: "Leather",
  ELASTAN: "Elastane",
  ELASTANEE: "Elastane",
};

const TERM_KEYS = Object.keys(TERMS).sort((a, b) => b.length - a.length);

/** Replace known Turkish terms with their English equivalent, in place. */
export function translateTerms(text: string): string {
  if (!text) return "";
  let out = deturkify(text);
  for (const key of TERM_KEYS) {
    // Word-boundary replace, case-insensitive: composition strings mix
    // "POLİESTER" and "Polyester" within the same file.
    const pattern = new RegExp(`(^|[^A-Za-z])${escapeRegex(key)}(?![A-Za-z])`, "gi");
    out = out.replace(pattern, (_, prefix) => `${prefix}${TERMS[key]}`);
  }
  return out;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words that must not be title-cased into "Ac&Co" or "Xl". */
const KEEP_UPPERCASE = new Set([
  "AC", "ACC", "CO", "AC&CO", "USA", "UK", "EU", "XS", "S", "M", "L", "XL", "XXL",
  "3XL", "4XL", "5XL", "PVC", "TPU", "EVA", "UV", "HS", "SKU", "GTIN", "EAN",
  // Fabric and construction acronyms that appear in style names.
  "CVC", "CP", "PU", "PP", "SS", "FW", "AW",
]);

const KEEP_LOWERCASE = new Set(["and", "or", "of", "the", "in", "with", "for", "de", "a"]);

/**
 * Title-case a phrase from a supplier file.
 *
 * "BASIC TSHIRT POLO COLLAR SLIM" → "Basic Tshirt Polo Collar Slim", while
 * "AC&CO" survives as itself and "4-PACK" keeps its shape.
 */
export function titleCase(raw: string): string {
  const text = deturkify(cleanText(raw));
  if (!text) return "";

  const words = text.split(" ");
  return words
    .map((word, index) => {
      const bare = word.replace(/[^A-Za-z0-9&]/g, "");
      if (KEEP_UPPERCASE.has(bare.toUpperCase()) && bare.toUpperCase() === bare) {
        return word;
      }
      if (index > 0 && KEEP_LOWERCASE.has(word.toLowerCase())) return word.toLowerCase();

      // Cap each alphabetic run so "5-POCKET" → "5-Pocket" and
      // "YARN-DYED" → "Yarn-Dyed" rather than "Yarn-dyed".
      return word
        .toLowerCase()
        .replace(/[a-z][a-z']*/g, (run, offset: number) =>
          // Don't capitalise the "s" in "Men's".
          offset > 0 && word[offset - 1] === "'"
            ? run
            : run.charAt(0).toUpperCase() + run.slice(1),
        );
    })
    .join(" ");
}

/**
 * Brands that must render exactly as the brand owner writes them —
 * title-casing turns AC&CO into "Ac&co", which looks like a typo on a
 * product page.
 */
const BRAND_OVERRIDES: Record<string, string> = {
  "AC&CO": "AC&Co",
  ACCO: "AC&Co",
  "AC BASICS": "AC Basics",
  "AC 360": "AC 360",
  "AC TRAVEL": "AC Travel",
  "AC LIMITED": "AC Limited",
  "AC COLLECTION": "AC Collection",
  "AC CEREMONY": "AC Ceremony",
  ACC: "ACC",
  "ACC 360": "ACC 360",
  ALTINYILDIZ: "Altınyıldız",
  "ALTINYILDIZ CLASSICS": "Altınyıldız Classics",
  "ALTINYILDIZ CLASSICS 360": "Altınyıldız Classics 360",
  "ALTINYILDIZ CLASSICS LIMITED EDITION": "Altınyıldız Classics Limited Edition",
  "ALTINYILDIZ CLASSICS SMART LINE": "Altınyıldız Classics Smart Line",
  "ALTINYILDIZ CLASSICS CEREMONY": "Altınyıldız Classics Ceremony",
  "ALTINYILDIZ COLLECTION": "Altınyıldız Collection",
  "ALTINYILDIZ COLLECTION CEREMONY": "Altınyıldız Collection Ceremony",
  "PREMIUM ALTINYILDIZ": "Premium Altınyıldız",
  "PREMIUM ALTINYILDIZ CEREMONY": "Premium Altınyıldız Ceremony",
  "COLLECTION CEREMONY": "Collection Ceremony",
};

export function brandName(raw: string): string {
  const text = cleanText(raw);
  if (!text) return "";
  return BRAND_OVERRIDES[deturkify(text).toUpperCase()] ?? titleCase(text);
}

/**
 * Spellings that are correct in the supplier's system but wrong on a
 * storefront. Applied after title-casing, so they survive it.
 */
const PHRASE_FIXUPS: [RegExp, string][] = [
  [/\bTshirt\b/g, "T-Shirt"],
  [/\bTshirts\b/g, "T-Shirts"],
  [/\bSweatshirt\b/g, "Sweatshirt"],
  [/\bNon Iron\b/g, "Non-Iron"],
  [/\bSlim Fit\b/g, "Slim-Fit"],
];

/** A product-facing phrase: translated, title-cased, then spelt our way. */
export function displayPhrase(raw: string): string {
  let text = titleCase(translateTerms(cleanText(raw)));
  for (const [pattern, replacement] of PHRASE_FIXUPS) text = text.replace(pattern, replacement);
  return text;
}

/**
 * Fabric composition, written the way an English-reading customer expects.
 *
 * Turkish puts the percent sign first — "%100 Cotton" — which reads as a
 * typo in English. The numbers and fibres are otherwise left alone.
 */
export function formatComposition(raw: string): string {
  const translated = translateTerms(cleanText(raw));
  if (!translated) return "";
  return translated
    .replace(/%\s*(\d+(?:[.,]\d+)?)/g, "$1%")
    // "100%Cotton" → "100% Cotton"
    .replace(/(\d%)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL-safe slug, matching lib/odoo/mapping.ts#slugifyCategory. */
export function slugify(raw: string): string {
  return deturkify(cleanText(raw))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Parse a number written the way a spreadsheet exports it.
 *
 * "1.234,56" (European) and "1,234.56" (Anglo) both have to become
 * 1234.56, and the only reliable signal is which separator comes last.
 */
export function parseNumber(raw: string | undefined | null): number | undefined {
  const text = cleanText(raw).replace(/[^\d.,\-]/g, "");
  if (!text) return undefined;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  let normalized = text;
  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (lastComma > -1) {
    // A lone comma is a decimal separator unless it is grouping thousands
    // ("1,234" has exactly three digits after it).
    normalized = /,\d{3}$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

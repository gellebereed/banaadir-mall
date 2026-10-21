/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEARCH — ranked, typo-tolerant, Somali-aware.
 * ─────────────────────────────────────────────────────────────────────────
 * The old search was `name.includes(query)`. So "drss" found nothing,
 * "dresses" missed "Maxi Dress", "dirac" (Somali for dress) found nothing,
 * and when something did match, the order was the catalogue's, not the
 * best match first.
 *
 *   1. Normalise: lower case, accents and Turkish letters folded, simple
 *      plurals dropped ("dresses" → "dress").
 *   2. Expand each word with its synonyms — Somali ↔ English, and the
 *      common English alternatives ("mobile" ↔ "phone").
 *   3. Correct words the catalogue has never heard of to the closest one it
 *      has ("drss" → "dress"), and say so ("Showing results for …").
 *   4. Score every product: a hit in the name counts most, then store,
 *      category and attributes, then the description; whole-word hits beat
 *      prefix hits ("sho" → shoes while typing).
 *   5. Every word must match. If that finds nothing, products matching the
 *      most words are shown instead, labelled as close matches.
 * Pure: the caller passes the products and the names to search by.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product } from "./types";

// ── Words ─────────────────────────────────────────────────────────────

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ç: "c", ö: "o", ü: "u", İ: "i" };

export function normalize(text: string): string {
  return text
    .replace(/[ışğçöüİ]/g, (ch) => FOLD[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Plural → singular, enough for product words ("dresses", "batteries", "shoes"). */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(sses|xes|ches|shes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

const STOP = new Set(["the", "a", "an", "and", "for", "with", "of", "in", "to", "iyo", "ee", "oo"]);

export function words(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

/*
 * Somali words shoppers type, and English alternatives sellers use. Each
 * entry expands the QUERY only — the catalogue is searched as written.
 * Keys and values are already in normalised, singular form.
 */
const SYNONYMS: Record<string, string[]> = {
  // Somali → English
  dirac: ["dress"],
  diracyo: ["dress"],
  garbasaar: ["shawl", "scarf"],
  shaal: ["shawl", "scarf"],
  xijaab: ["hijab"],
  jilbaab: ["jilbab", "abaya"],
  cabaayad: ["abaya"],
  macawi: ["macawis", "sarong"],
  shaati: ["shirt"],
  surwaal: ["trouser", "pant"],
  funaanad: ["sweater", "jumper"],
  jaakad: ["jacket"],
  kabo: ["shoe", "sandal"],
  kab: ["shoe"],
  koofiyad: ["hat", "cap"],
  sharaabaad: ["sock"],
  saacad: ["watch"],
  bac: ["bag"],
  boorso: ["bag", "handbag"],
  taleefan: ["phone"],
  telefoon: ["phone"],
  moobil: ["phone"],
  mobilka: ["phone"],
  kombiyuutar: ["computer", "laptop"],
  laabtob: ["laptop"],
  telefishin: ["tv", "television"],
  cadar: ["perfume", "fragrance"],
  udgoon: ["perfume", "fragrance", "incense"],
  uunsi: ["incense", "bakhoor"],
  timo: ["hair"],
  wiil: ["boy"],
  gabadh: ["girl"],
  carruur: ["kid", "child"],
  ilmo: ["baby"],
  dumar: ["women", "woman", "lady"],
  haween: ["women", "woman"],
  rag: ["men", "man"],
  sariir: ["bed"],
  kursi: ["chair"],
  miis: ["table"],
  gogol: ["rug", "carpet", "mat"],
  roog: ["rug", "carpet"],
  buste: ["blanket", "duvet"],
  dheri: ["pot", "cookware"],
  digsi: ["pot", "pan", "cookware"],
  koob: ["cup", "mug"],
  saxan: ["plate", "dish"],
  bariis: ["rice"],
  caano: ["milk"],
  sonkor: ["sugar"],
  shaah: ["tea"],
  qaxwo: ["coffee"],
  bun: ["coffee"],
  baasto: ["pasta"],
  saliid: ["oil"],
  hilib: ["meat"],
  // English alternatives
  phone: ["smartphone", "mobile"],
  mobile: ["phone", "smartphone"],
  smartphone: ["phone", "mobile"],
  cellphone: ["phone"],
  tv: ["television"],
  television: ["tv"],
  earbud: ["earphone", "headphone", "aurapod"],
  earphone: ["earbud", "headphone"],
  headphone: ["earphone", "earbud"],
  laptop: ["notebook", "computer"],
  notebook: ["laptop"],
  sneaker: ["trainer", "shoe"],
  trainer: ["sneaker", "shoe"],
  trouser: ["pant", "chino"],
  pant: ["trouser", "chino"],
  sofa: ["couch"],
  couch: ["sofa"],
  perfume: ["fragrance", "oud", "cologne"],
  fragrance: ["perfume"],
  scarf: ["shawl", "hijab"],
  charger: ["charging", "adapter"],
  powerbank: ["power", "bank"],
};

/** Damerau–Levenshtein (optimal string alignment), stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a word of this length may carry and still be corrected. */
function allowedTypos(word: string): number {
  return word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
}

// ── Index ─────────────────────────────────────────────────────────────

export interface SearchContext {
  /** store slug → store name */
  storeNames: Map<string, string>;
  /** category slug → category name (and its parent's, for "Women's Fashion › Dresses") */
  categoryNames: Map<string, string>;
  /** Readable attribute values per product — "Cotton", "V-neck" (lib/taxonomy-attributes). */
  attributeText?: (product: Product) => string;
}

interface Indexed {
  product: Product;
  fields: { words: Set<string>; weight: number }[];
}

const WEIGHTS = { name: 5, store: 3, category: 3, attributes: 2, description: 1 } as const;

function index(products: Product[], ctx: SearchContext): { items: Indexed[]; vocabulary: Map<string, number> } {
  const vocabulary = new Map<string, number>();
  const items = products.map((product) => {
    const field = (text: string | undefined, weight: number, inVocabulary = true) => {
      const set = new Set(words(text ?? ""));
      if (inVocabulary) for (const w of set) if (w.length >= 3) vocabulary.set(w, (vocabulary.get(w) ?? 0) + 1);
      return { words: set, weight };
    };
    return {
      product,
      fields: [
        field(product.name, WEIGHTS.name),
        field(`${ctx.storeNames.get(product.store) ?? ""} ${product.supplier?.brand ?? ""}`, WEIGHTS.store),
        field(`${ctx.categoryNames.get(product.category) ?? ""} ${product.subcategory ?? ""}`, WEIGHTS.category),
        field(
          `${ctx.attributeText?.(product) ?? ""} ${(product.variants ?? []).map((v) => `${v.color ?? ""} ${v.size ?? ""}`).join(" ")} ${(product.colors ?? []).join(" ")}`,
          WEIGHTS.attributes,
        ),
        // Descriptions are long and loose: searched, but kept out of the
        // spelling vocabulary so a stray word there can't "correct" a query.
        field(product.description, WEIGHTS.description, false),
      ],
    };
  });
  return { items, vocabulary };
}

// ── Search ────────────────────────────────────────────────────────────

export interface SearchResult {
  products: Product[];
  /** The query as corrected, when a word was corrected ("drss" → "dress"). */
  correctedQuery?: string;
  /** True when not every word matched and close matches are shown instead. */
  partial: boolean;
}

export function searchCatalog(products: Product[], query: string, ctx: SearchContext): SearchResult {
  const queryWords = words(query);
  if (queryWords.length === 0) return { products: [], partial: false };
  const { items, vocabulary } = index(products, ctx);

  // Correct unknown words to the nearest catalogue word (more common wins a tie).
  let corrected = false;
  const fixed = queryWords.map((w) => {
    if (vocabulary.has(w) || SYNONYMS[w] || [...vocabulary.keys()].some((v) => v.startsWith(w))) return w;
    const max = allowedTypos(w);
    if (max === 0) return w;
    let best: { word: string; d: number; n: number } | undefined;
    for (const [candidate, n] of vocabulary) {
      const d = distance(w, candidate, max);
      if (d <= max && (!best || d < best.d || (d === best.d && n > best.n))) best = { word: candidate, d, n };
    }
    if (best) corrected = true;
    return best?.word ?? w;
  });

  // Synonyms go through the same stemming as the catalogue's own words.
  const alternatives = fixed.map((w) => [w, ...(SYNONYMS[w] ?? []).map(stem)]);

  const scored = items.map(({ product, fields }) => {
    let total = 0;
    let matched = 0;
    for (const alts of alternatives) {
      let best = 0;
      for (const f of fields) {
        for (const alt of alts) {
          if (f.words.has(alt)) best = Math.max(best, f.weight * 3);
          else if (alt.length >= 3) {
            for (const w of f.words) {
              if (w.startsWith(alt)) {
                best = Math.max(best, f.weight * 2);
                break;
              }
            }
          }
        }
      }
      if (best > 0) matched++;
      total += best;
    }
    // Bestsellers first among equals.
    return { product, matched, score: total + Math.log10((product.sold ?? 0) + 1) * 0.5 };
  });

  const rank = (list: typeof scored) => list.sort((a, b) => b.score - a.score).map((s) => s.product);
  const all = scored.filter((s) => s.matched === alternatives.length);
  const correctedQuery = corrected ? fixed.join(" ") : undefined;
  if (all.length > 0) return { products: rank(all), correctedQuery, partial: false };

  // Nothing matched every word ("red silk evening dress"): offer what
  // matched the most of them, most words first — labelled as close matches.
  if (alternatives.length > 1) {
    const some = scored
      .filter((s) => s.matched > 0)
      .sort((a, b) => b.matched - a.matched || b.score - a.score)
      .slice(0, 48)
      .map((s) => s.product);
    if (some.length > 0) return { products: some, correctedQuery, partial: true };
  }
  return { products: [], correctedQuery, partial: false };
}

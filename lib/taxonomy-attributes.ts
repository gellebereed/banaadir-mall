/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ATTRIBUTES — what a shopper can filter a category by. Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 * Each standard category (lib/taxonomy.ts) comes with its attributes from
 * the same taxonomy: Dresses have Colour, Size, Fabric, Neckline…; Mobile
 * phones have Operating system, SIM capability…; each with a fixed list
 * of values. scripts/build-taxonomy.mjs keeps the ones worth filtering by.
 *
 * A product stores `attributes: { [handle]: valueKey[] }`. Fixed values are
 * the whole point: "Cotton" from one store and "cotton 100%" from another
 * are the same filter only if both sellers picked the same value.
 *
 * Colour and size need no extra work from sellers — they are read off the
 * product's variants (see productFacetValues) when not set explicitly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import data from "./taxonomy/attributes.json";
import { colorSwatch, variantColors, variantSizes } from "./product-utils";
import { standardNode } from "./taxonomy";
import type { Product } from "./types";

export interface AttributeValue {
  key: string;
  name: string;
}

export interface AttributeDef {
  handle: string;
  name: string;
  values: AttributeValue[];
}

/** Must match valueSlug() in scripts/build-taxonomy.mjs. */
export function valueSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type RawValue = string | [string, string];
const defs: AttributeDef[] = (data.attributes as [string, string, RawValue[]][]).map(([handle, name, values]) => ({
  handle,
  name,
  values: values.map((v) => (typeof v === "string" ? { key: valueSlug(v), name: v } : { key: v[0], name: v[1] })),
}));
const byHandle = new Map(defs.map((d) => [d.handle, d]));
const byCategory = data.byCategory as Record<string, number[]>;

export function attributeDef(handle: string): AttributeDef | undefined {
  return byHandle.get(handle);
}

/**
 * The attributes of a standard category. A node with none of its own (a
 * top-level department such as Baby & Toddler) borrows its nearest
 * ancestor's, so a product filed there still gets something to fill in.
 */
export function attributesForStandard(standardId: string | undefined | null): AttributeDef[] {
  let node = standardNode(standardId);
  while (node) {
    const own = byCategory[node.id];
    if (own?.length) return own.map((i) => defs[i]);
    node = standardNode(node.parentId);
  }
  return [];
}

/**
 * Keep only attributes this category has and values that exist — the form
 * posts JSON, and nothing but the fixed lists may reach the database.
 */
export function cleanAttributes(raw: unknown, allowed: AttributeDef[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const def of allowed) {
    const picked = (raw as Record<string, unknown>)[def.handle];
    if (!Array.isArray(picked)) continue;
    const valid = new Set(def.values.map((v) => v.key));
    const keys = [...new Set(picked.filter((k): k is string => typeof k === "string" && valid.has(k)))];
    if (keys.length) out[def.handle] = keys.slice(0, 20);
  }
  return out;
}

// ── Colour and size from variants ─────────────────────────────────────

/** Words that name a standard colour outright. Order matters: specific first. */
const COLOR_WORDS: [RegExp, string][] = [
  [/rose ?gold/, "rose-gold"],
  [/multi|rainbow|print/, "multicolor"],
  [/navy|lacivert/, "navy"],
  [/beige|cream|ivory|off.?white|camel|khaki|nude|ecru|natural|sand|stone|taupe|bej|krem/, "beige"],
  [/terracotta|rust|apricot|peach/, "orange"],
  [/bronze|copper/, "bronze"],
  [/gold|altın|altin/, "gold"],
  [/silver|gümüş|gumus/, "silver"],
  [/clear|transparent/, "clear"],
  [/black|siyah|madow|jet/, "black"],
  [/white|beyaz|\bcad\b/, "white"],
  [/gr[ae]y|charcoal|anthracite|antrasit|gri|slate/, "gray"],
  [/brown|tan\b|chocolate|coffee|mocha|kahve|bunni/, "brown"],
  [/pink|rose|fuchsia|magenta|blush|salmon|pembe/, "pink"],
  [/purple|violet|lilac|lavender|plum|mor\b/, "purple"],
  [/red|burgundy|maroon|wine|bordo|kırmızı|kirmizi|casaan/, "red"],
  [/orange|turuncu|coral/, "orange"],
  [/yellow|mustard|sarı|sari|hardal|jaalle/, "yellow"],
  [/green|olive|mint|emerald|yeşil|yesil|haki|cagaar/, "green"],
  [/blue|turquoise|teal|cyan|indigo|denim|mavi|buluug/, "blue"],
];

const STANDARD_HEX: Record<string, [number, number, number]> = {
  beige: [0xe8, 0xd8, 0xb8], black: [0x11, 0x18, 0x27], blue: [0x25, 0x63, 0xeb],
  bronze: [0xcd, 0x7f, 0x32], brown: [0x78, 0x35, 0x0f], gold: [0xd4, 0xaf, 0x37],
  gray: [0x9c, 0xa3, 0xaf], green: [0x16, 0xa3, 0x4a], navy: [0x1e, 0x3a, 0x8a],
  orange: [0xf9, 0x73, 0x16], pink: [0xec, 0x48, 0x99], purple: [0x7c, 0x3a, 0xed],
  red: [0xdc, 0x26, 0x26], silver: [0xe5, 0xe7, 0xeb], white: [0xff, 0xff, 0xff],
  yellow: [0xfa, 0xcc, 0x15],
};

/** A free-text colour ("Dark Grey", "Siyah", "Midnight") → a standard colour key. */
export function standardColor(name: string): string | undefined {
  const clean = name.trim().toLowerCase();
  if (!clean) return undefined;
  for (const [pattern, key] of COLOR_WORDS) if (pattern.test(clean)) return key;
  // Otherwise the swatch table's 90 names, by nearest colour. Names it
  // doesn't know come back as a hashed hsl() — not evidence of anything.
  const hex = colorSwatch(clean);
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return undefined;
  const rgb = [1, 2, 3].map((i) => parseInt(m[i], 16));
  let best: string | undefined;
  let bestD = Infinity;
  for (const [key, ref] of Object.entries(STANDARD_HEX)) {
    const d = (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (d < bestD) [best, bestD] = [key, d];
  }
  return best;
}

const SIZE_ALIASES: Record<string, string> = {
  XXXS: "triple-extra-small-xxxs", "3XS": "triple-extra-small-xxxs",
  XXS: "double-extra-small-xxs", "2XS": "double-extra-small-xxs",
  XS: "extra-small-xs", S: "small-s", M: "medium-m", L: "large-l", XL: "extra-large-xl",
  XXL: "double-extra-large-xxl", "2XL": "double-extra-large-xxl",
  XXXL: "triple-extra-large-xxxl", "3XL": "triple-extra-large-xxxl",
  "4XL": "four-extra-large-4xl", "5XL": "five-extra-large-5xl", "6XL": "six-extra-large-6xl",
  "ONE SIZE": "one-size", STANDARD: "one-size", "FREE SIZE": "one-size", OS: "one-size",
};

/** A variant size ("M", "2XL", "38") → a standard Size value, when one exists. */
export function standardSize(name: string, def = byHandle.get("size")): string | undefined {
  const upper = name.trim().toUpperCase();
  if (SIZE_ALIASES[upper]) return SIZE_ALIASES[upper];
  const key = valueSlug(name);
  return def?.values.some((v) => v.key === key) ? key : undefined;
}

/**
 * Everything a product can be filtered by: what the seller set, plus
 * colour and size read off its variants when they didn't set those.
 */
export function productFacetValues(product: Product): Record<string, string[]> {
  const out: Record<string, string[]> = { ...(product.attributes ?? {}) };
  if (!out.color?.length) {
    const colors = [...new Set(variantColors(product).map(standardColor).filter((c): c is string => Boolean(c)))];
    if (colors.length) out.color = colors;
  }
  if (!out.size?.length && !out["shoe-size"]?.length) {
    const sizes = [...new Set(variantSizes(product).map((s) => standardSize(s)).filter((s): s is string => Boolean(s)))];
    if (sizes.length) out.size = sizes;
  }
  return out;
}

// ── Storefront facets ─────────────────────────────────────────────────

export interface Facet {
  handle: string;
  name: string;
  values: { key: string; name: string; count: number }[];
}

export interface FacetData {
  facets: Facet[];
  /** product id → ["color:black", "fabric:cotton", …] — what the client filters on. */
  index: Record<string, string[]>;
}

const FIRST = ["color", "size", "shoe-size", "target-gender"];

/**
 * The filters worth showing for these products: attributes at least two
 * products carry, with the values actually in use (a filter that returns
 * nothing when ticked is noise). Colour and size first, then by coverage.
 */
export function buildFacets(products: Product[], max = 8): FacetData {
  const index: Record<string, string[]> = {};
  const counts = new Map<string, Map<string, number>>();
  const coverage = new Map<string, number>();

  for (const product of products) {
    const values = productFacetValues(product);
    const tokens: string[] = [];
    for (const [handle, keys] of Object.entries(values)) {
      if (!byHandle.has(handle) || keys.length === 0) continue;
      coverage.set(handle, (coverage.get(handle) ?? 0) + 1);
      const c = counts.get(handle) ?? new Map<string, number>();
      for (const key of keys) {
        c.set(key, (c.get(key) ?? 0) + 1);
        tokens.push(`${handle}:${key}`);
      }
      counts.set(handle, c);
    }
    if (tokens.length) index[product.id] = tokens;
  }

  const rank = (h: string) => (FIRST.includes(h) ? FIRST.indexOf(h) : FIRST.length);
  const facets = [...counts.entries()]
    .filter(([handle]) => (coverage.get(handle) ?? 0) >= 2)
    .sort(([a], [b]) => rank(a) - rank(b) || (coverage.get(b) ?? 0) - (coverage.get(a) ?? 0))
    .slice(0, max)
    .map(([handle, c]) => {
      const def = byHandle.get(handle)!;
      // The taxonomy's own order (XS before S, 0-3 months before 3-6).
      const order = new Map(def.values.map((v, i) => [v.key, i]));
      return {
        handle,
        name: def.name,
        values: [...c.entries()]
          .filter(([key]) => order.has(key))
          .sort(([a], [b]) => order.get(a)! - order.get(b)!)
          .map(([key, count]) => ({ key, name: def.values[order.get(key)!].name, count })),
      };
    })
    // One value every product shares filters nothing out.
    .filter((f) => f.values.length > 1 || f.values[0]?.count < products.length);

  return { facets, index };
}

// ── Editor ────────────────────────────────────────────────────────────

/** Read off variants instead — see productFacetValues. */
export const FROM_VARIANTS = new Set(["color", "size", "shoe-size"]);

export interface AttributeSets {
  defs: Record<string, AttributeDef>;
  /** Banaadir category slug → the attribute handles a seller fills in. */
  byCategory: Record<string, string[]>;
}

/**
 * What the product editor needs for these categories, each definition
 * once — Fabric's 48 values shouldn't travel once per clothing category.
 */
export function attributeSetsFor(categories: { slug: string; standardId?: string }[]): AttributeSets {
  const sets: AttributeSets = { defs: {}, byCategory: {} };
  for (const category of categories) {
    const attrs = attributesForStandard(category.standardId).filter((a) => !FROM_VARIANTS.has(a.handle));
    if (attrs.length === 0) continue;
    sets.byCategory[category.slug] = attrs.map((a) => a.handle);
    for (const a of attrs) sets.defs[a.handle] = a;
  }
  return sets;
}

/** The seller's attributes as readable rows, for the product page. */
export function describeAttributes(attributes: Product["attributes"]): { name: string; value: string }[] {
  return Object.entries(attributes ?? {})
    .map(([handle, keys]) => {
      const def = byHandle.get(handle);
      if (!def || FROM_VARIANTS.has(handle)) return null;
      const names = keys.map((k) => def.values.find((v) => v.key === k)?.name).filter(Boolean);
      return names.length ? { name: def.name, value: names.join(", ") } : null;
    })
    .filter((row): row is { name: string; value: string } => row !== null);
}

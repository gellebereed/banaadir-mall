/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CONTENT SIMILARITY — "this one is like that one".
 * ─────────────────────────────────────────────────────────────────────────
 * Every product becomes a sparse vector of weighted features: its category
 * path, subcategory, store, brand, season, colours, price band, and the
 * meaningful words in its name and description. Similarity is the cosine
 * between two of those vectors.
 *
 * ── Why IDF matters here more than usual ─────────────────────────────────
 * Term weights are inverse-document-frequency scaled, which on a small
 * marketplace catalogue is not a refinement — it is the whole thing. Half
 * the products in a fashion import share the words "cotton", "regular" and
 * "men". Without IDF, cosine similarity ranks by "is also a men's cotton
 * garment", and the shopper looking at a wool suit is shown eleven t-shirts.
 * With it, the rare words — "espresso", "duvet", "chino" — do the matching,
 * which is what a human means by "similar".
 *
 * ── Why this exists alongside the co-purchase graph ──────────────────────
 * The affinity graph (lib/reco/affinity.ts) is far better evidence, but it
 * is silent on any product nobody has bought yet. That is every new listing
 * and most of a young marketplace's catalogue. Content similarity has no
 * cold start: a product is comparable the moment it is created. The engine
 * leans on behaviour where behaviour exists and on content where it does
 * not, which is the only way a recommender is useful in week one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product } from "../types";
import { priceBand, tokenize } from "./taste";

/** A unit-length sparse vector: feature → weight. */
export type FeatureVector = Map<string, number>;

export interface SimilarityIndex {
  vectors: Map<string, FeatureVector>;
  /** Product ids grouped by category — the cheap candidate short-list. */
  byCategory: Map<string, string[]>;
  byStore: Map<string, string[]>;
  /**
   * Product ids by standard-taxonomy node (lib/taxonomy.ts) — the "same
   * kind of thing" across stores, whatever each store's category is called.
   */
  byStandard: Map<string, string[]>;
}

/**
 * Structured facets are weighted well above free text. Two products in the
 * same subcategory from the same brand are similar even when their names
 * share nothing, and that is more reliable than any word overlap.
 */
const FACET_WEIGHTS = {
  category: 2.6,
  subcategory: 2.2,
  store: 1.1,
  brand: 1.4,
  season: 0.7,
  color: 0.5,
  priceBand: 0.9,
  feature: 0.5,
  /** Name words carry more than description words — they are the label. */
  name: 1.5,
  description: 0.45,
  /**
   * The standard taxonomy: the node itself, and more weakly its ancestors —
   * "Dresses" is close, "Clothing" a little, "Apparel" barely (IDF then
   * discounts whatever is common in this catalogue).
   */
  standard: 2.4,
  standardParent: 1.1,
  standardRoot: 0.4,
  /** A shared attribute value — Fabric: cotton, Neckline: V-neck. */
  attribute: 0.9,
} as const;

function facetsOf(product: Product, standardId?: string): Map<string, number> {
  const raw = new Map<string, number>();
  const add = (key: string, weight: number) => {
    raw.set(key, (raw.get(key) ?? 0) + weight);
  };

  if (standardId) {
    // Ids nest by prefix: "aa" › "aa-1" › "aa-1-4".
    const parts = standardId.split("-");
    add(`std:${standardId}`, FACET_WEIGHTS.standard);
    if (parts.length > 2) add(`std:${parts.slice(0, -1).join("-")}`, FACET_WEIGHTS.standardParent);
    if (parts.length > 1) add(`std:${parts[0]}`, FACET_WEIGHTS.standardRoot);
  }
  for (const [handle, keys] of Object.entries(product.attributes ?? {})) {
    for (const key of keys) add(`attr:${handle}:${key}`, FACET_WEIGHTS.attribute);
  }

  add(`cat:${product.category}`, FACET_WEIGHTS.category);
  if (product.subcategory) add(`sub:${product.subcategory.toLowerCase()}`, FACET_WEIGHTS.subcategory);
  add(`store:${product.store}`, FACET_WEIGHTS.store);
  if (product.supplier?.brand) add(`brand:${product.supplier.brand.toLowerCase()}`, FACET_WEIGHTS.brand);
  if (product.supplier?.season) add(`season:${product.supplier.season.toLowerCase()}`, FACET_WEIGHTS.season);
  add(`band:${priceBand(product.price)}`, FACET_WEIGHTS.priceBand);

  for (const color of colorsOf(product)) add(`color:${color}`, FACET_WEIGHTS.color);
  for (const feature of product.features ?? []) {
    for (const term of tokenize(feature)) add(`t:${term}`, FACET_WEIGHTS.feature);
  }
  for (const term of tokenize(product.name)) add(`t:${term}`, FACET_WEIGHTS.name);
  // Descriptions are long and repetitive across an import batch; only the
  // opening sentence or two is doing any distinguishing work.
  for (const term of tokenize((product.description ?? "").slice(0, 260))) {
    add(`t:${term}`, FACET_WEIGHTS.description);
  }

  return raw;
}

function colorsOf(product: Product): string[] {
  const colors = new Set<string>();
  for (const color of product.colors ?? []) colors.add(color.toLowerCase());
  for (const variant of product.variants ?? []) {
    if (variant.color) colors.add(variant.color.toLowerCase());
  }
  return [...colors];
}

/** Build the index for a whole catalogue. O(n · features). */
export function buildSimilarityIndex(
  products: Product[],
  /** The standard-taxonomy node of a product's category, when linked. */
  standardOf: (product: Product) => string | undefined = () => undefined,
): SimilarityIndex {
  const rawVectors = new Map<string, Map<string, number>>();
  const documentFrequency = new Map<string, number>();

  for (const product of products) {
    const facets = facetsOf(product, standardOf(product));
    rawVectors.set(product.id, facets);
    for (const key of facets.keys()) {
      documentFrequency.set(key, (documentFrequency.get(key) ?? 0) + 1);
    }
  }

  const total = Math.max(1, products.length);
  const vectors = new Map<string, FeatureVector>();

  for (const [id, facets] of rawVectors) {
    const vector: FeatureVector = new Map();
    let norm = 0;
    for (const [key, weight] of facets) {
      // Smoothed IDF. A feature present on every product ends at ~0 and
      // drops out; a feature on one product is worth the most.
      const idf = Math.log((total + 1) / ((documentFrequency.get(key) ?? 0) + 1)) + 1;
      const value = weight * idf;
      vector.set(key, value);
      norm += value * value;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [key, value] of vector) vector.set(key, value / norm);
    vectors.set(id, vector);
  }

  const byCategory = new Map<string, string[]>();
  const byStore = new Map<string, string[]>();
  const byStandard = new Map<string, string[]>();
  for (const product of products) {
    push(byCategory, product.category, product.id);
    push(byStore, product.store, product.id);
    const standard = standardOf(product);
    if (standard) push(byStandard, standard, product.id);
  }

  return { vectors, byCategory, byStore, byStandard };
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Cosine similarity, 0–1. Both vectors are already unit length. */
export function similarity(a: FeatureVector | undefined, b: FeatureVector | undefined): number {
  if (!a || !b) return 0;
  // Walk the shorter vector — sparse vectors here differ a lot in length.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [key, value] of small) {
    const other = large.get(key);
    if (other) dot += value * other;
  }
  return dot;
}

/**
 * The most similar products to a seed.
 *
 * `sameCategoryOnly` is the difference between "you may also like" (yes —
 * alternatives to what you are looking at) and "goes with this" (no — the
 * useful partner for a duvet is a pillowcase, not another duvet).
 */
export function nearestTo(
  seedId: string,
  index: SimilarityIndex,
  candidates: Iterable<string>,
  limit: number,
  minimum = 0.08,
): { id: string; score: number }[] {
  const seed = index.vectors.get(seedId);
  if (!seed) return [];

  const scored: { id: string; score: number }[] = [];
  for (const id of candidates) {
    if (id === seedId) continue;
    const score = similarity(seed, index.vectors.get(id));
    if (score >= minimum) scored.push({ id, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * How alike two products are, for the diversity pass in the ranker. Kept
 * separate from `similarity` so the ranker can reason in plain terms: two
 * items from one shop in one category are near-duplicates on a shelf even
 * when their feature vectors disagree.
 */
export function shelfDistance(a: Product, b: Product, index: SimilarityIndex): number {
  const content = similarity(index.vectors.get(a.id), index.vectors.get(b.id));
  const sameStore = a.store === b.store ? 0.35 : 0;
  const sameCategory = a.category === b.category ? 0.2 : 0;
  const sameSubcategory =
    a.subcategory && a.subcategory === b.subcategory ? 0.2 : 0;
  return Math.min(1, content + sameStore + sameCategory + sameSubcategory);
}

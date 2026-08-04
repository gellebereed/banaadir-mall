/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TASTE — turning raw events into what somebody actually likes.
 * ─────────────────────────────────────────────────────────────────────────
 * Given the shopper's event list and the live catalogue, this produces the
 * weighted picture the strategies score against: which departments, shops,
 * brands, colours and prices they lean toward, and which products they have
 * already seen, saved, basketed or bought.
 *
 * ── Two ideas do most of the work ────────────────────────────────────────
 *
 * INTENT WEIGHTING. Not every action means the same thing. Opening a page
 * is curiosity; choosing a size is intent; buying is proof. Treating those
 * as one "interaction" is why so many recommenders show you more of
 * whatever you accidentally clicked. The weights below are ordered by how
 * much a shopper had to *commit* to produce the signal.
 *
 * RECENCY DECAY. Interest is perishable. Someone who spent last week buying
 * kitchenware and is now looking at school shoes has moved on, and a system
 * averaging over all time will keep selling them saucepans. Every signal
 * halves in weight every TASTE_HALF_LIFE_DAYS, so the profile tracks the
 * person rather than their archive.
 *
 * One deliberate asymmetry: a *purchase* decays much more slowly than a
 * view. What you bought says something durable about you; what you glanced
 * at on Tuesday does not.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product } from "../types";
import type { EventKind, TasteEvent, TasteProfile } from "./types";

/** How much each kind of action counts, before decay. */
const INTENT_WEIGHT: Record<EventKind, number> = {
  view: 1,
  // Dwell is scaled by seconds (see dwellWeight) — this is its ceiling.
  dwell: 2.5,
  option: 3,
  wish: 5,
  unwish: -4,
  cart: 7,
  uncart: -5,
  buy: 12,
  search: 1.5,
  mute: -14,
};

/** Interest halves every fortnight… */
const TASTE_HALF_LIFE_DAYS = 14;
/** …except a purchase, which stays meaningful for a season. */
const PURCHASE_HALF_LIFE_DAYS = 75;

const DAY_MS = 86_400_000;

/**
 * Reading time, converted to interest. Under five seconds is a bounce and
 * scores nothing; the curve saturates by two minutes so a forgotten open
 * tab cannot outweigh a real decision.
 */
function dwellWeight(seconds: number): number {
  if (seconds < 5) return 0;
  return Math.min(1, Math.log10(seconds / 4) / Math.log10(30));
}

function decayFactor(ageMs: number, halfLifeDays: number): number {
  return Math.pow(2, -Math.max(0, ageMs) / (halfLifeDays * DAY_MS));
}

/** Price bands, so "what this shopper spends" survives a changing catalogue. */
export function priceBand(price: number): string {
  if (price < 10) return "under-10";
  if (price < 25) return "10-25";
  if (price < 50) return "25-50";
  if (price < 100) return "50-100";
  if (price < 250) return "100-250";
  return "250-plus";
}

export interface Taste {
  /** Decayed weight per category slug. Positive numbers only. */
  categories: Map<string, number>;
  subcategories: Map<string, number>;
  stores: Map<string, number>;
  brands: Map<string, number>;
  colors: Map<string, number>;
  priceBands: Map<string, number>;
  /** Free-text tokens from names, descriptions and searches. */
  terms: Map<string, number>;

  /** Every product touched, with its net decayed weight (can be negative). */
  affinity: Map<string, number>;

  /** Products seen, in the order they were last seen — newest first. */
  viewedRecent: string[];
  wished: Set<string>;
  carted: Set<string>;
  bought: Set<string>;
  muted: Set<string>;
  /** Everything the shopper has already been shown a page of. */
  touched: Set<string>;

  /** Typical spend, from products actually engaged with. */
  medianPrice: number;
  /** Recent searches, newest first. */
  queries: string[];

  /**
   * 0–1. How much the engine really knows. Below ~0.15 the personalised
   * shelves are suppressed entirely rather than filled with noise —
   * a "Chosen for you" rail built on two page views is worse than nothing,
   * because it teaches the shopper that the label means nothing.
   */
  confidence: number;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "our", "new",
  "set", "pack", "size", "cm", "mm", "pcs", "piece", "pieces", "of", "in",
  "a", "an", "to", "by", "on", "is", "are", "it", "its", "as", "at", "or",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word.length > 2 && word.length < 20 && !STOP_WORDS.has(word));
}

function bump(map: Map<string, number>, key: string | undefined, weight: number): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

/**
 * Derive the full picture. `now` is injectable so this is testable without
 * freezing the clock everywhere else.
 */
export function deriveTaste(
  profile: TasteProfile,
  catalogue: Map<string, Product>,
  now = Date.now(),
): Taste {
  const taste: Taste = {
    categories: new Map(),
    subcategories: new Map(),
    stores: new Map(),
    brands: new Map(),
    colors: new Map(),
    priceBands: new Map(),
    terms: new Map(),
    affinity: new Map(),
    viewedRecent: [],
    wished: new Set(),
    carted: new Set(),
    bought: new Set(),
    muted: new Set(profile.muted ?? []),
    touched: new Set(),
    medianPrice: 0,
    queries: [],
    confidence: 0,
  };

  const prices: number[] = [];
  const viewedAt = new Map<string, number>();
  let committedSignals = 0;

  for (const event of profile.events ?? []) {
    const base = INTENT_WEIGHT[event.k];
    if (base === undefined) continue;

    const halfLife = event.k === "buy" ? PURCHASE_HALF_LIFE_DAYS : TASTE_HALF_LIFE_DAYS;
    const decay = decayFactor(now - event.at, halfLife);

    if (event.k === "search") {
      if (event.q) {
        taste.queries.push(event.q);
        for (const term of tokenize(event.q)) {
          bump(taste.terms, term, base * decay * 2);
        }
      }
      continue;
    }

    if (!event.id) continue;

    // Set membership is about *state*, not weight, so it is recorded even
    // for a signal so old it contributes nothing to the score.
    trackState(taste, event, viewedAt);

    const product = catalogue.get(event.id);
    const weight = event.k === "dwell" ? base * dwellWeight(event.s ?? 0) : base;
    const signal = weight * decay;
    if (signal === 0) continue;

    // Confidence is measured in units of COMMITMENT, not clicks. One
    // "unit" is choosing a size; a page view is a third of one, saving
    // something is nearly two, a purchase four. Counting raw interactions
    // instead would let a shopper who opened twelve pages and engaged with
    // none of them look as well understood as one who bought twice.
    if (weight > 0) {
      committedSignals += Math.min(1.5, weight / INTENT_WEIGHT.option) * decay;
    }

    taste.affinity.set(event.id, (taste.affinity.get(event.id) ?? 0) + signal);
    if (!product) continue;

    taste.touched.add(product.id);

    bump(taste.categories, product.category, signal);
    bump(taste.subcategories, product.subcategory, signal);
    bump(taste.stores, product.store, signal);
    bump(taste.brands, product.supplier?.brand, signal);
    bump(taste.priceBands, priceBand(product.price), signal);

    for (const color of product.colors ?? []) bump(taste.colors, color.toLowerCase(), signal);
    for (const variant of product.variants ?? []) {
      if (variant.color) bump(taste.colors, variant.color.toLowerCase(), signal);
    }

    // Names carry the real vocabulary of a catalogue ("duvet", "espresso",
    // "chino"), which is what lets taste cross a badly-filed category.
    for (const term of tokenize(product.name)) {
      bump(taste.terms, term, signal * 0.6);
    }

    if (signal > 0) prices.push(product.price);
  }

  taste.queries = [...new Set(taste.queries.reverse())].slice(0, 8);
  taste.viewedRecent = [...viewedAt.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  taste.medianPrice = median(prices);

  // Four units is "we know enough to say 'for you' and mean it": about a
  // dozen product pages, or three saves, or a single order.
  taste.confidence = Math.min(1, committedSignals / 4);

  // Muted products are pushed decisively negative so nothing downstream has
  // to remember to filter them — but they are also filtered, twice over.
  for (const id of taste.muted) taste.affinity.set(id, -100);

  return taste;
}

function trackState(taste: Taste, event: TasteEvent, viewedAt: Map<string, number>): void {
  const id = event.id!;
  switch (event.k) {
    case "view":
    case "dwell":
    case "option":
      viewedAt.set(id, Math.max(viewedAt.get(id) ?? 0, event.at));
      break;
    case "wish":
      taste.wished.add(id);
      break;
    case "unwish":
      taste.wished.delete(id);
      break;
    case "cart":
      taste.carted.add(id);
      break;
    case "uncart":
      taste.carted.delete(id);
      break;
    case "buy":
      taste.bought.add(id);
      taste.carted.delete(id);
      break;
    default:
      break;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * How well a product fits the shopper's taste, 0–1ish.
 *
 * Each facet is normalised against the shopper's own strongest preference
 * rather than an absolute scale, so someone who has looked at four things
 * and someone who has looked at four hundred both get sensible numbers.
 */
export function tasteScore(product: Product, taste: Taste): number {
  const category = relative(taste.categories, product.category);
  const subcategory = relative(taste.subcategories, product.subcategory);
  const store = relative(taste.stores, product.store);
  const brand = relative(taste.brands, product.supplier?.brand);
  const band = relative(taste.priceBands, priceBand(product.price));

  let termScore = 0;
  const terms = tokenize(product.name);
  if (terms.length > 0) {
    const strongest = maxValue(taste.terms);
    if (strongest > 0) {
      for (const term of terms) termScore += (taste.terms.get(term) ?? 0) / strongest;
      termScore = Math.min(1, termScore / Math.sqrt(terms.length));
    }
  }

  let colorScore = 0;
  const strongestColor = maxValue(taste.colors);
  if (strongestColor > 0) {
    for (const color of product.colors ?? []) {
      colorScore = Math.max(colorScore, (taste.colors.get(color.toLowerCase()) ?? 0) / strongestColor);
    }
    for (const variant of product.variants ?? []) {
      if (!variant.color) continue;
      colorScore = Math.max(
        colorScore,
        (taste.colors.get(variant.color.toLowerCase()) ?? 0) / strongestColor,
      );
    }
  }

  return (
    category * 0.28 +
    subcategory * 0.18 +
    store * 0.14 +
    brand * 0.08 +
    termScore * 0.18 +
    band * 0.08 +
    colorScore * 0.06
  );
}

function relative(map: Map<string, number>, key: string | undefined): number {
  if (!key) return 0;
  const strongest = maxValue(map);
  if (strongest <= 0) return 0;
  return Math.max(0, (map.get(key) ?? 0) / strongest);
}

function maxValue(map: Map<string, number>): number {
  let max = 0;
  for (const value of map.values()) if (value > max) max = value;
  return max;
}

/** The shopper's strongest N preferences in one facet, strongest first. */
export function topKeys(map: Map<string, number>, limit = 3): string[] {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

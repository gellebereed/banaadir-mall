/**
 * ─────────────────────────────────────────────────────────────────────────
 *  LABELS — a seller's own private tags on a product.
 * ─────────────────────────────────────────────────────────────────────────
 * Safe to import from client and server.
 *
 * Sellers kept asking to "pick a badge" so they could say "these 40 items
 * are clearance" and then put exactly those on sale — or keep them OUT of a
 * store-wide sale. A badge is the wrong tool for that: it is what shoppers
 * see on the card, it is worked out from facts (lib/badges.ts), and a badge
 * a shop can pin on itself is an advert shoppers learn to ignore.
 *
 * A label is the private version: any word the seller likes ("Clearance",
 * "Winter 2026", "Old stock"), never shown on the storefront, and usable
 * by a promotion to choose its products (Promotion.includeLabels) or to
 * leave some out (Promotion.excludeLabels). The promotion keeps the RULE,
 * not a snapshot, so a product labelled next week joins the sale by itself.
 *
 * Labels compare case-insensitively ("clearance" is "Clearance") and are
 * stored as the seller first spelled them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product, Promotion } from "./types";

export const MAX_LABEL_LENGTH = 30;
export const MAX_LABELS_PER_PRODUCT = 10;

/** "  clearance   SALE " → "clearance SALE". Empty when nothing is left. */
export function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
}

const key = (label: string) => cleanLabel(label).toLowerCase();

/**
 * A tidy label list: cleaned, no blanks, no repeats whatever their case,
 * at most MAX_LABELS_PER_PRODUCT. `known` lets a new spelling reuse the
 * store's existing one, so "clearance" typed today joins "Clearance" from
 * last month instead of starting a second label that looks the same.
 */
export function tidyLabels(raw: readonly string[], known: readonly string[] = []): string[] {
  const canonical = new Map(known.map((l) => [key(l), cleanLabel(l)]));
  const out = new Map<string, string>();
  for (const item of raw) {
    const clean = cleanLabel(String(item));
    if (!clean) continue;
    const k = clean.toLowerCase();
    if (!out.has(k)) out.set(k, canonical.get(k) ?? clean);
  }
  return [...out.values()].slice(0, MAX_LABELS_PER_PRODUCT);
}

/** Read a label list posted by a form: JSON array, or comma-separated. */
export function parseLabels(value: FormDataEntryValue | null, known: readonly string[] = []): string[] {
  if (value === null) return [];
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return tidyLabels(parsed.map(String), known);
  } catch {
    // Not JSON — a plain comma list.
  }
  return tidyLabels(text.split(","), known);
}

export function hasLabel(product: Pick<Product, "labels">, label: string): boolean {
  const k = key(label);
  return (product.labels ?? []).some((l) => key(l) === k);
}

function hasAnyLabel(product: Pick<Product, "labels">, labels: readonly string[] | undefined): boolean {
  return Boolean(labels?.length) && labels!.some((l) => hasLabel(product, l));
}

/** Every label a store uses, A→Z, with how many products carry it. */
export function storeLabels(products: readonly Pick<Product, "labels">[]): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const p of products) {
    for (const l of p.labels ?? []) {
      const k = key(l);
      const entry = counts.get(k);
      if (entry) entry.count++;
      else counts.set(k, { label: cleanLabel(l), count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Does this promotion cover this product? The ONE answer used for pricing
 * (lib/api.ts), the campaign page (lib/campaigns.ts) and the dashboard's
 * counts, so the three can never disagree about what is on sale.
 *
 *   picked products  → exactly those
 *   labels           → every product carrying any of them, today
 *   neither          → the whole store
 * …and then anything carrying an excluded label is left out.
 *
 * The store and the pre-order rule are checked by the callers.
 */
export function promotionCovers(
  promo: Pick<Promotion, "productIds" | "includeLabels" | "excludeLabels">,
  product: Pick<Product, "id" | "labels">,
): boolean {
  if (hasAnyLabel(product, promo.excludeLabels)) return false;
  if (promo.productIds?.length) return promo.productIds.includes(product.id);
  if (promo.includeLabels?.length) return hasAnyLabel(product, promo.includeLabels);
  return true;
}

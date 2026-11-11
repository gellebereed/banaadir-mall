/**
 * ─────────────────────────────────────────────────────────────────────────
 *  BADGES — the one thing a card says about a product, worked out, not typed.
 * ─────────────────────────────────────────────────────────────────────────
 * A badge used to be a word saved on the product. Every product was created
 * with "New" and nothing ever took it off, so a year later the whole
 * catalogue was "New" — which is the same as no product being new, and it
 * taught shoppers that the pill in the corner means nothing.
 *
 * A badge is now a FACT about the product today, re-derived on every read:
 *
 *   Pre-order     the shop is taking orders ahead of the stock
 *   Sale          the price charged is below the "was" price  (shows −N%)
 *   Low stock     5 or fewer left, from the real count        (shows "Only N left")
 *   Just landed   pre-ordered stock arrived in the last 14 days
 *   New           listed in the last NEW_DAYS days
 *   Bestseller    among the top sellers of its own category
 *
 * Each one expires by itself, because the fact it states stops being true:
 * the sale ends, the shelf is refilled, three weeks pass, something else
 * outsells it. Nobody has to remember to remove anything.
 *
 * Only one is shown, and the order above is the order of what a shopper can
 * act on: a deadline or a saving outranks a description. The questions
 * "is it new?" and "is it a bestseller?" stay answerable for a product
 * wearing a higher badge — see isNewProduct — so the New Arrivals rail
 * does not lose a product the day it also goes on sale.
 *
 * The seller's only control is to switch badges OFF for a product
 * (`badge: "Off"` on the stored record). They cannot pin one on: a badge a
 * shop can award itself is an advert, and shoppers learn to ignore those.
 *
 * Safe to import from client and server.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { isPreorder, justLanded } from "./preorder";
import { totalStock } from "./product-utils";
import type { Product, ProductBadge } from "./types";

/** A product is "New" for this many days after it was first listed. */
export const NEW_DAYS = 21;

/** Stock at or below this is said out loud — the same line lib/reco/psychology.ts uses. */
export const LOW_STOCK_BADGE = 5;

/** A category's top sellers: this share of it, between these bounds. */
const BESTSELLER_SHARE = 0.05;
const BESTSELLER_MAX_PER_CATEGORY = 8;
/** Below this many sales nothing is a bestseller, however small the category. */
const BESTSELLER_MIN_SOLD = 10;

const DAY = 86_400_000;

/**
 * Listed recently enough to call new. A product with no known listing date
 * is not new: guessing "yes" is how the whole catalogue ended up badged.
 */
export function isNewProduct(product: Pick<Product, "createdAt" | "preorder">, now = Date.now()): boolean {
  // Stock that landed this fortnight is new to the shelf, whenever it was listed.
  if (justLanded(product, now)) return true;
  if (!product.createdAt) return false;
  const listed = Date.parse(product.createdAt);
  return Number.isFinite(listed) && now - listed < NEW_DAYS * DAY;
}

/**
 * The products that have earned "Bestseller": the top few of each category
 * by units sold. Per category on purpose — ranked across the whole mall,
 * every bestseller would be a phone charger and no dress would ever be one.
 */
export function bestsellerIds(products: Product[]): Set<string> {
  const byCategory = new Map<string, Product[]>();
  for (const p of products) {
    if (p.hidden || (p.sold ?? 0) < BESTSELLER_MIN_SOLD) continue;
    const list = byCategory.get(p.category);
    if (list) list.push(p);
    else byCategory.set(p.category, [p]);
  }

  // The share is of the WHOLE category, not just of what cleared the floor.
  const sizes = new Map<string, number>();
  for (const p of products) {
    if (!p.hidden) sizes.set(p.category, (sizes.get(p.category) ?? 0) + 1);
  }

  const ids = new Set<string>();
  for (const [category, list] of byCategory) {
    const size = sizes.get(category) ?? list.length;
    const take = Math.min(
      BESTSELLER_MAX_PER_CATEGORY,
      Math.max(1, Math.ceil(size * BESTSELLER_SHARE)),
    );
    list
      .sort((a, b) => b.sold - a.sold)
      .slice(0, take)
      .forEach((p) => ids.add(p.id));
  }
  return ids;
}

/**
 * The badge this product wears right now, or none.
 *
 * `product` is the PRICED product (discounts applied), so "Sale" reflects
 * what is actually charged. `bestsellers` comes from bestsellerIds().
 */
export function smartBadge(
  product: Product,
  bestsellers: ReadonlySet<string>,
  now = Date.now(),
): ProductBadge | undefined {
  if (product.badge === "Off") return undefined;

  if (isPreorder(product)) return "Pre-order";
  if (product.compareAt && product.compareAt > product.price) return "Sale";

  const stock = totalStock(product);
  if (stock > 0 && stock <= LOW_STOCK_BADGE) return "Low stock";

  if (justLanded(product, now)) return "Just landed";
  if (isNewProduct(product, now)) return "New";
  if (bestsellers.has(product.id)) return "Bestseller";
  return undefined;
}

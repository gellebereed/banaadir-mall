/**
 * The products an offer can be completed with — what the cart shows under
 * "Add one more item up to $49 and get it for $1", and what /offer/[id]
 * lists in full.
 *
 * The nudge used to end in "Shop items →", the shop's whole catalogue: the
 * shopper had to work out for themselves which items qualified (in scope,
 * at full price where the offer says so, cheap enough to be the discounted
 * one). Here the catalogue is cut down to what the offer can reach; the
 * browser then prices each candidate against the actual basket with the
 * same engine checkout uses (components/cart/OfferPicks.tsx), so every
 * saving shown is the saving that will be charged.
 *
 * Server only (reads the catalogue). The type is shared.
 */

import { getProducts } from "./api";
import { hasVariants, primaryImage, totalStock } from "./product-utils";
import type { Offer, Product } from "./types";

export interface OfferPick {
  id: string;
  slug: string;
  name: string;
  /** Today's price, after any price promotion — what the cart would charge. */
  price: number;
  compareAt?: number;
  image?: string;
  icon: string;
  store: string;
  /** Has variants to choose — added from its page, as on a product card. */
  needsChoice: boolean;
}

/** In this offer's reach at all: its shop, its products, in stock, eligible price. */
export function offerReaches(offer: Offer, product: Product): boolean {
  if (product.store !== offer.store || product.hidden || totalStock(product) <= 0) return false;
  if (offer.fullPriceOnly && (product.compareAt ?? 0) > product.price) return false;
  if (offer.kind === "bundle") return (offer.bundle ?? []).some((b) => b.productId === product.id);
  // The free gift is the reward, not something that earns it.
  if (offer.kind === "gift" && product.id === offer.gift?.productId) return false;
  return !offer.productIds?.length || offer.productIds.includes(product.id);
}

export function toPick(product: Product): OfferPick {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    compareAt: product.compareAt,
    image: primaryImage(product),
    icon: product.icon,
    store: product.store,
    needsChoice: hasVariants(product),
  };
}

/** Best sellers first: the likeliest add-on is the one most people choose. */
export function rankPicks(products: Product[]): Product[] {
  return [...products].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0) || a.price - b.price);
}

/** Up to `limit` candidates per offer id. Unknown ids are simply absent. */
export async function picksForOffers(offers: Offer[], limit = 30): Promise<Record<string, OfferPick[]>> {
  const products = await getProducts();
  const out: Record<string, OfferPick[]> = {};
  for (const offer of offers) {
    out[offer.id] = rankPicks(products.filter((p) => offerReaches(offer, p)))
      .slice(0, limit)
      .map(toPick);
  }
  return out;
}

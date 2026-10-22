/**
 * Price a basket on the SERVER, from the catalogue — never from what the
 * browser says things cost.
 *
 * The cart and checkout ask for this (priceCartAction) so the totals they
 * show are exactly the ones submitOrderAction will record, and the counter
 * uses the same engine for walk-in sales. See lib/offers.ts for the rules.
 */

import { getAllProducts, getMarketingSettings, getOffers } from "./api";
import { priceCart, type CartPricing, type PricingLine } from "./offers";
import { findVariant, variantPrice } from "./product-utils";
import type { Product } from "./types";

export interface PricingRequestItem {
  productId: string;
  qty: number;
  selectedColor?: string;
  selectedSize?: string;
  /** Used only when the product is no longer in the catalogue. */
  fallbackPrice?: number;
  fallbackStore?: string;
}

export interface PromoStatus {
  code: string;
  pct: number;
  /** The code typed matches the marketplace code. */
  valid: boolean;
  /** Shops that accepted it. */
  stores: string[];
}

export interface ServerPricing {
  pricing: CartPricing;
  /** Same order as the request; line keys are their index. */
  lines: PricingLine[];
  products: (Product | undefined)[];
  promo: PromoStatus | null;
}

export async function priceItems(
  items: PricingRequestItem[],
  promoCode?: string,
): Promise<ServerPricing> {
  const [catalog, offers, marketing] = await Promise.all([
    getAllProducts(),
    getOffers(),
    getMarketingSettings(),
  ]);
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const products = items.map((item) => byId.get(item.productId));
  const lines: PricingLine[] = items.map((item, index) => {
    const product = products[index];
    const price = product
      ? variantPrice(product, findVariant(product, item.selectedColor, item.selectedSize))
      : Math.max(0, Number(item.fallbackPrice) || 0);
    return {
      key: String(index),
      productId: item.productId,
      store: product?.store || item.fallbackStore || "",
      price,
      qty: Math.max(0, Math.min(999, Math.floor(Number(item.qty) || 0))),
      onSale: product ? (product.compareAt ?? 0) > product.price : false,
    };
  });

  const typed = (promoCode ?? "").trim().toUpperCase();
  const code = marketing.promo.code.trim().toUpperCase();
  const promo: PromoStatus | null = typed
    ? {
        code: typed,
        pct: marketing.promo.pct,
        valid: Boolean(code) && marketing.promo.pct > 0 && typed === code,
        stores: marketing.promo.stores ?? [],
      }
    : null;

  const pricing = priceCart(lines, offers, {
    promo: promo?.valid ? { code: promo.code, pct: promo.pct, stores: promo.stores } : null,
  });
  return { pricing, lines, products, promo };
}

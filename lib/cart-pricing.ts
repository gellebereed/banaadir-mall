/**
 * Price a basket on the SERVER, from the catalogue — never from what the
 * browser says things cost.
 *
 * The cart and checkout ask for this (priceCartAction) so the totals they
 * show are exactly the ones submitOrderAction will record, and the counter
 * uses the same engine for walk-in sales. See lib/offers.ts for the rules.
 */

import { getAllProducts, getMarketingSettings, getOffers, getOrders } from "./api";
import { isExhausted, isOfferLive, offerUsageFrom, priceCart, type CartPricing, type OfferUsage, type PricingLine } from "./offers";
import { findVariant, lineDeal, variantPrice, type LineDeal } from "./product-utils";
import type { Offer, Product } from "./types";

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
  /** Shop coupons this code unlocks (an offer with this `code`). */
  shopOffers: { store: string; name: string }[];
  /**
   * Those coupons' offers in full, so the browser can price them as the
   * basket changes (useCartPricing) instead of waiting on the server. Only
   * ever sent to someone who has typed the code.
   */
  unlocked: Offer[];
}

export interface ServerPricing {
  pricing: CartPricing;
  /** Same order as the request; line keys are their index. */
  lines: PricingLine[];
  products: (Product | undefined)[];
  promo: PromoStatus | null;
  /** Per line (same order): its "was" price and flash status, from today's catalogue. */
  deals: LineDeal[];
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
  const usage = await usageFor(offers);
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
  const promo = typed ? codeStatus(typed, marketing.promo, offers, usage) : null;

  const pricing = priceCart(lines, offers, {
    promo: promo?.valid ? { code: promo.code, pct: promo.pct, stores: promo.stores } : null,
    codes: typed ? [typed] : [],
    usage,
  });
  const deals = lines.map((line, index) => (products[index] ? lineDeal(products[index]!, line.price) : {}));
  return { pricing, lines, products, promo, deals };
}

/** What a typed code is: the marketplace promo, a shop coupon, or nothing. */
function codeStatus(
  typed: string,
  marketplace: { code: string; pct: number; stores?: string[] },
  offers: Awaited<ReturnType<typeof getOffers>>,
  usage: Record<string, OfferUsage>,
): PromoStatus {
  const code = marketplace.code.trim().toUpperCase();
  const unlocked = offers.filter((o) => o.code === typed && isOfferLive(o) && !isExhausted(o, usage[o.id]));
  return {
    code: typed,
    pct: marketplace.pct,
    valid: Boolean(code) && marketplace.pct > 0 && typed === code,
    stores: marketplace.stores ?? [],
    shopOffers: unlocked.map((o) => ({ store: o.store, name: o.name })),
    unlocked,
  };
}

/**
 * Usage so far — only worked out when some live offer is actually limited,
 * because it means reading the orders.
 */
async function usageFor(offers: Awaited<ReturnType<typeof getOffers>>): Promise<Record<string, OfferUsage>> {
  if (!offers.some((o) => isOfferLive(o) && (o.maxUses || o.budget))) return {};
  return offerUsageFrom(await getOrders());
}

/** Is this code worth applying? Marketplace promo or a live shop coupon. */
export async function checkCode(promoCode: string): Promise<PromoStatus | null> {
  const typed = promoCode.trim().toUpperCase();
  if (!typed) return null;
  const [offers, marketing] = await Promise.all([getOffers(), getMarketingSettings()]);
  return codeStatus(typed, marketing.promo, offers, await usageFor(offers));
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { PromoStatus } from "@/lib/cart-pricing";
import { priceCart, type CartPricing, type PricingLine } from "@/lib/offers";
import type { MarketingSettings, Offer } from "@/lib/types";

/** What the hook needs from a cart line (lib/cart-context CartLine fits). */
export interface PricedLineLike {
  productId: string;
  qty: number;
  color?: string;
  size?: string;
  product: { price: number; store: string; compareAt?: number };
}

/** The offers the page was rendered with — see app/cart/page.tsx. */
export interface PricingContext {
  /** Every live shop offer that needs no code. */
  offers: Offer[];
  /** The marketplace promo code (already public on the cart page). */
  promo: MarketingSettings["promo"];
}

/** Line keys are positions in `lines`, as the server uses them. */
export function toPricingLines(lines: PricedLineLike[]): PricingLine[] {
  return lines.map((l, i) => ({
    key: String(i),
    productId: l.productId,
    store: l.product.store,
    price: l.product.price,
    qty: l.qty,
    onSale: (l.product.compareAt ?? 0) > l.product.price,
  }));
}

/**
 * The basket's prices — offers, promo code and all — on screen at once.
 *
 * ── Why it used to lag ───────────────────────────────────────────────────
 * Every change waited for the server: 200 ms of debounce, then a server
 * action that loaded the whole catalogue and every offer. Next.js runs a
 * page's server actions one at a time, and the cart also fetches its
 * recommendation shelves through one, so the price check often queued
 * behind those. Shoppers added "Buy 1, get the next for $1" and watched the
 * cart charge full price for a few seconds — and again on checkout.
 *
 * ── Now ──────────────────────────────────────────────────────────────────
 * The pricing engine (lib/offers.ts) is pure, so it runs right here on the
 * offers the page was rendered with: the discount is part of the very
 * render that shows the item. The server still prices the same basket in
 * the background (/api/cart/price, a route, so nothing queues it) and its
 * answer replaces this one when it arrives — it knows today's catalogue
 * price, coupon offers and usage limits. submitOrderAction prices the order
 * once more when it is placed, so nothing the browser computes is trusted.
 */
export function useCartPricing(lines: PricedLineLike[], promoCode: string | null, context: PricingContext) {
  const code = (promoCode ?? "").trim().toUpperCase();
  const key = `${lines
    .map((l) => `${l.productId}|${l.qty}|${l.color ?? ""}|${l.size ?? ""}|${l.product.price}`)
    .join(",")}#${code}`;

  const [server, setServer] = useState<{ key: string; pricing: CartPricing; promo: PromoStatus | null } | null>(null);
  /** Coupon offers the server confirmed for a code — priced locally from then on. */
  const [unlocked, setUnlocked] = useState<{ code: string; offers: Offer[] } | null>(null);

  const local = useMemo(() => {
    if (lines.length === 0) return null;
    const marketplace = context.promo.code.trim().toUpperCase();
    const couponOffers = unlocked && unlocked.code === code ? unlocked.offers : [];
    const valid = Boolean(code) && Boolean(marketplace) && context.promo.pct > 0 && code === marketplace;
    const promo: PromoStatus | null = code
      ? {
          code,
          pct: context.promo.pct,
          valid,
          stores: context.promo.stores ?? [],
          shopOffers: couponOffers.map((o) => ({ store: o.store, name: o.name })),
          unlocked: couponOffers,
        }
      : null;
    const pricing = priceCart(toPricingLines(lines), [...context.offers, ...couponOffers], {
      promo: valid ? { code, pct: context.promo.pct, stores: context.promo.stores ?? [] } : null,
      codes: code ? [code] : [],
    });
    return { pricing, promo };
    // `lines` and `code` are captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unlocked, context.offers, context.promo]);

  useEffect(() => {
    if (lines.length === 0) return;
    const controller = new AbortController();
    // Short: the screen is already right; this only confirms it.
    const timer = setTimeout(() => {
      fetch("/api/cart/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            selectedColor: l.color,
            selectedSize: l.size,
          })),
          promoCode: code || undefined,
        }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((result: { pricing: CartPricing; promo: PromoStatus | null } | null) => {
          if (!result?.pricing) return;
          setServer({ key, pricing: result.pricing, promo: result.promo });
          if (code && result.promo?.unlocked?.length) setUnlocked({ code, offers: result.promo.unlocked });
        })
        .catch(() => {
          // Offline or superseded: the locally priced basket stands.
        });
    }, 120);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `lines` and `code` are captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const confirmed = server !== null && server.key === key;
  return {
    pricing: confirmed ? server.pricing : (local?.pricing ?? null),
    promo: confirmed ? server.promo : (local?.promo ?? null),
    /** False while the server has yet to confirm what is on screen. */
    confirmed,
  };
}

/**
 * Is this code worth applying — the marketplace promo, or a live shop
 * coupon? Asked of the server, which is the only place that knows. Through
 * the pricing route rather than a server action, so it can't queue behind
 * the recommendation shelves either.
 */
export async function verifyCode(code: string): Promise<boolean> {
  try {
    const response = await fetch("/api/cart/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [], promoCode: code }),
    });
    if (!response.ok) return false;
    const { promo } = (await response.json()) as { promo: PromoStatus | null };
    return Boolean(promo && (promo.valid || promo.shopOffers.length > 0));
  } catch {
    return false;
  }
}

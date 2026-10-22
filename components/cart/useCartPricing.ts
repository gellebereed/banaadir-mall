"use client";

import { useEffect, useState } from "react";
import type { PromoStatus } from "@/lib/cart-pricing";
import type { CartPricing } from "@/lib/offers";

interface LineLike {
  productId: string;
  qty: number;
  color?: string;
  size?: string;
}

/**
 * The basket priced by the server — today's prices, the shop offers and
 * the promo code — exactly as submitOrderAction will record it.
 *
 * Re-asked whenever the basket or the code changes (debounced, so tapping
 * + five times is one request). `pricing` is null until the first answer
 * arrives; callers show the cart's own prices meanwhile. Line keys are the
 * positions of `lines`.
 */
export function useCartPricing(lines: LineLike[], promoCode: string | null) {
  const [state, setState] = useState<{ key: string; pricing: CartPricing; promo: PromoStatus | null } | null>(null);
  const key = `${lines.map((l) => `${l.productId}|${l.qty}|${l.color ?? ""}|${l.size ?? ""}`).join(",")}#${promoCode ?? ""}`;

  useEffect(() => {
    if (lines.length === 0) return;
    let live = true;
    const timer = setTimeout(() => {
      import("@/app/actions")
        .then(({ priceCartAction }) =>
          priceCartAction(
            lines.map((l) => ({ productId: l.productId, qty: l.qty, selectedColor: l.color, selectedSize: l.size })),
            promoCode ?? undefined,
          ),
        )
        .then((result) => live && setState({ key, ...result }))
        .catch(() => {
          // Offline: the cart's own prices stand; the server still decides.
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `lines` and `promoCode` are captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    pricing: state?.pricing ?? null,
    promo: state?.promo ?? null,
    /** The answer on screen is for an older basket — a request is in flight. */
    stale: state !== null && state.key !== key,
  };
}

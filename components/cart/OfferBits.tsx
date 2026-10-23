"use client";

import { useMemo } from "react";
import OfferPicks, { nudgeProgress, useOfferPicks } from "@/components/cart/OfferPicks";
import { useT } from "@/components/prefs/PrefsProvider";
import { useCart } from "@/lib/cart-context";
import type { PromoStatus } from "@/lib/cart-pricing";
import { money } from "@/lib/format";
import { nudgeText, offerHeadline, type CartPricing, type LinePricing, type PricingLine, type StorePricing } from "@/lib/offers";
import type { Offer } from "@/lib/types";

/** A line's total — crossed-out list price and the offer's name when it saved something. */
export function LinePrice({
  line,
  fallbackTotal,
  unitPrice,
  qty,
  size = "lg",
}: {
  line?: LinePricing;
  fallbackTotal: number;
  unitPrice: number;
  qty: number;
  size?: "lg" | "sm";
}) {
  const t = useT();
  const saved = line && line.discount > 0;
  const names = saved ? [...new Set(line.units.map((u) => u.offerName).filter(Boolean))] : [];
  return (
    <div className="shrink-0 text-right">
      {saved && <p className="text-[11px] text-slate-400 line-through tabular-nums">{money(line.listTotal)}</p>}
      <p
        className={`font-display font-bold tabular-nums ${saved ? "text-emerald-700" : "text-ocean-950"} ${
          size === "lg" ? "text-base sm:text-lg" : "text-sm"
        }`}
      >
        {money(line?.total ?? fallbackTotal)}
      </p>
      {!saved && qty > 1 && size === "lg" && (
        <p className="text-[11px] text-slate-400">{t("cart.each", { price: money(line?.units[0]?.listPrice ?? unitPrice) })}</p>
      )}
      {names.map((name) => (
        <p key={name} className="mt-0.5 max-w-[11rem] truncate text-[10px] font-bold text-emerald-700">
          🎁 {name}
        </p>
      ))}
    </div>
  );
}

/** Under a shop's header: what its offers saved, and what would unlock more. */
export function ParcelOffers({
  store,
  basket,
  offers,
  compact = false,
}: {
  store?: StorePricing;
  /** The whole basket as the pricing engine sees it — for the item picks. */
  basket: PricingLine[];
  /** The offers the basket is priced with (useCartPricing's context). */
  offers: Offer[];
  compact?: boolean;
}) {
  const t = useT();
  const { addToCart } = useCart();
  const nudges = store?.nudges ?? [];
  const picks = useOfferPicks(nudges.filter((n) => n.kind !== "giftAdd").map((n) => n.offer.id));
  // Coupon offers only reach the page through the pricing answer; the
  // picks must be simulated with them too, or their savings would vanish.
  const allOffers = useMemo(() => {
    const byId = new Map(offers.map((o) => [o.id, o]));
    for (const a of store?.applied ?? []) byId.set(a.offer.id, a.offer);
    for (const n of nudges) byId.set(n.offer.id, n.offer);
    return [...byId.values()];
  }, [offers, store, nudges]);

  if (!store || (store.applied.length === 0 && nudges.length === 0)) return null;
  return (
    <div className={`space-y-2 ${compact ? "mb-2" : "border-t border-sand-100 px-4 py-3"}`}>
      {store.applied.map((a) => (
        <p key={a.offer.id} className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-700">
          <span className="min-w-0 truncate">🎁 {offerHeadline(a.offer, t, money)}</span>
          <span className="shrink-0">{t("offer.saved", { amount: money(a.discount) })}</span>
        </p>
      ))}
      {nudges.map((n) => {
        const progress = nudgeProgress(n, basket);
        return (
          <div key={n.offer.id + n.kind} className="rounded-xl bg-mango-500/10 px-3 py-2">
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-semibold text-ocean-900">
              <span>
                {n.kind === "giftAdd" ? "🎀" : "💡"} {nudgeText(n, t, money)}
              </span>
              {n.kind === "giftAdd" && (
                <button
                  type="button"
                  onClick={() =>
                    addToCart({
                      productId: n.gift.productId,
                      qty: 1,
                      snapshot: {
                        name: n.gift.name,
                        price: n.gift.price ?? 0,
                        icon: n.gift.icon ?? "🎁",
                        slug: n.gift.slug,
                        store: n.offer.store,
                        image: n.gift.image,
                      },
                    })
                  }
                  className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700"
                >
                  {t("offer.addGift")}
                </button>
              )}
            </p>
            {/* How close they are — "1 of 2 items", "$38 of $50". */}
            {progress && progress.of > 0 && (
              <div className="mt-1.5 flex items-center gap-2" aria-hidden>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/80">
                  <span
                    className="block h-full rounded-full bg-mango-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(6, (progress.done / progress.of) * 100))}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
                  {progress.money
                    ? `${money(progress.done)} / ${money(progress.of)}`
                    : t("offer.pick.progress", { done: progress.done, of: progress.of })}
                </span>
              </div>
            )}
            {n.kind !== "giftAdd" && (
              <OfferPicks nudge={n} picks={picks[n.offer.id]} basket={basket} offers={allOffers} compact={compact} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The summary's discount rows: shop offers, and the promo code. */
export function DiscountRows({
  pricing,
  promo,
  code,
  pct,
  onRemove,
}: {
  pricing: CartPricing | null;
  promo: PromoStatus | null;
  code: string | null;
  pct: number;
  onRemove: () => void;
}) {
  const t = useT();
  const shops = pricing ? Object.values(pricing.stores) : [];
  const accepting = promo?.valid ? shops.filter((s) => promo.stores.includes(s.store)).length : 0;
  /*
   * A real code that none of these shops honour saves nothing. It used to
   * show in green as "Promo BANAADIR10 (10%) −$0" — applied, as far as the
   * shopper could tell — with the explanation in small print beneath.
   */
  const savesNothing = Boolean(pricing && promo?.valid && accepting === 0 && promo.shopOffers.length === 0);
  return (
    <>
      {pricing && pricing.offerDiscount > 0 && (
        <div className="flex justify-between text-emerald-700">
          <dt>🎁 {t("offer.offersLine")}</dt>
          <dd className="font-semibold tabular-nums">−{money(pricing.offerDiscount)}</dd>
        </div>
      )}
      {code && (
        <div className={savesNothing ? "text-amber-700" : "text-emerald-700"}>
          <div className="flex justify-between">
            <dt className="flex items-center gap-2">
              {promo?.valid && !savesNothing ? t("cart.discount", { code, pct }) : t("offer.codeLine", { code })}
              <button
                type="button"
                onClick={onRemove}
                className="text-[11px] font-semibold text-slate-400 underline hover:text-coral-600"
              >
                {t("cart.remove")}
              </button>
            </dt>
            {(!pricing || promo?.valid) && !savesNothing && (
              <dd className="font-semibold tabular-nums">
                {pricing ? `−${money(pricing.promoDiscount)}` : "…"}
              </dd>
            )}
          </div>
          {/* A shop's own coupon: its saving shows under "Shop offers". */}
          {pricing && promo && promo.shopOffers.map((o) => (
            <p key={o.store + o.name} className="mt-1 text-xs font-medium">
              ✓ {t("offer.codeUnlocked", { code, name: o.name })}
            </p>
          ))}
          {/* The marketplace code is the shops' to honour — say plainly where it doesn't. */}
          {savesNothing && (
            <p className="mt-1 text-xs font-medium text-amber-700">{t("offer.promoNotHere", { code })}</p>
          )}
          {pricing && promo?.valid && accepting > 0 && accepting < shops.length && (
            <p className="mt-1 text-xs font-medium text-slate-500">{t("offer.promoSome", { n: accepting })}</p>
          )}
          {pricing && promo && !promo.valid && promo.shopOffers.length === 0 && (
            <p className="mt-1 text-xs font-medium text-coral-600">{t("offer.codeInvalid")}</p>
          )}
        </div>
      )}
    </>
  );
}

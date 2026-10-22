"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductImage from "@/components/ProductImage";
import StoreAvatar from "@/components/StoreAvatar";
import DeliveryCity from "@/components/layout/DeliveryCity";
import { useT } from "@/components/prefs/PrefsProvider";
import FreeDeliveryMeter from "@/components/reco/FreeDeliveryMeter";
import RecoStack from "@/components/reco/RecoStack";
import { DiscountRows, LinePrice, ParcelOffers } from "@/components/cart/OfferBits";
import { useCartPricing, verifyCode } from "@/components/cart/useCartPricing";
import { cartLineKey, useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import { groupByStore } from "@/lib/order-utils";
import { readAppliedPromo, writeAppliedPromo } from "@/lib/promo";
import type { MarketingSettings, Store } from "@/lib/types";

/**
 * The basket.
 *
 * Lines are grouped by the shop that sends them, because that is how they
 * arrive: one parcel per shop. Saying so here, rather than only on the
 * confirmation screen, means nobody is surprised by two couriers.
 *
 * A promo code applied here is carried to checkout (lib/promo.ts) and
 * honoured there — it used to stop at this page, so the discount the
 * shopper was shown was never the price they were charged.
 */
export default function CartClient({
  settings,
  stores,
}: {
  settings: MarketingSettings;
  stores: Store[];
}) {
  const { fee, freeThreshold } = settings.delivery;
  const promo = settings.promo;
  const t = useT();
  const { lines, ready, subtotal, updateQty, removeFromCart, toggleWishlist, isWishlisted } = useCart();

  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [promoError, setPromoError] = useState(false);

  // Restore a code applied earlier in this visit (or on the checkout page).
  useEffect(() => setApplied(readAppliedPromo()), [promo]);

  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  // Priced by the server: today's prices, shop offers, the promo code for
  // the shops that accepted it. Until it answers, the cart's own prices.
  const { pricing, promo: promoStatus } = useCartPricing(lines, applied);
  const positionOf = new Map(lines.map((l, i) => [cartLineKey(l), String(i)]));
  const pricedLine = (key: string) => pricing?.lines[positionOf.get(key) ?? ""];
  const listTotal = pricing?.listTotal ?? subtotal;
  const itemsTotal = pricing?.total ?? subtotal;
  const qualifiesFree = freeThreshold > 0 && itemsTotal >= freeThreshold;
  const delivery = qualifiesFree || lines.length === 0 ? 0 : fee;
  const total = itemsTotal + delivery;

  const parcels = useMemo(
    () => [...groupByStore(lines.map((l) => ({ ...l, store: l.product.store }))).entries()],
    [lines],
  );

  async function applyPromo(e: React.FormEvent) {
    e.preventDefault();
    if (await verifyCode(promoInput.trim().toUpperCase())) {
      const code = promoInput.trim().toUpperCase();
      setApplied(code);
      writeAppliedPromo(code);
      setPromoError(false);
      setPromoOpen(false);
    } else {
      setPromoError(true);
    }
  }

  function clearPromo() {
    setApplied(null);
    writeAppliedPromo(null);
    setPromoInput("");
  }

  if (!ready) return <CartSkeleton />;

  if (lines.length === 0) {
    return (
      <div className="pb-10">
        <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-sand-100 text-6xl" aria-hidden>
            🛒
          </span>
          <h1 className="mt-6 font-display text-2xl font-extrabold text-ocean-950">{t("cart.empty")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("cart.emptySub")}</p>
          <Link href="/products" className="btn-primary mt-6">
            {t("cart.startShopping")}
          </Link>
        </div>
        {/* An empty cart is the best possible place to show somebody the
            thing they were already looking at. */}
        <RecoStack surface="home" only={["continue", "price-drops", "for-you", "rising"]} />
      </div>
    );
  }

  const itemCount = units === 1 ? t("cart.itemsOne") : t("cart.itemsMany", { n: units });

  return (
    <div className="pb-8">
      {/* The cart itself is a page column; the shelves underneath run
          edge to edge so their tinted bands read as a change of surface
          rather than a coloured box. */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:pt-8">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
            {t("cart.title")}{" "}
            <span className="text-base font-semibold text-slate-400 sm:text-lg">({itemCount})</span>
          </h1>
          <Link href="/products" className="hidden text-sm font-semibold text-ocean-700 hover:underline sm:block">
            ← {t("cart.continue")}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-4 self-start">
            {parcels.length > 1 && (
              <p className="flex items-center gap-2 rounded-2xl bg-ocean-50 px-4 py-3 text-sm text-ocean-900 ring-1 ring-ocean-100">
                <span aria-hidden>📦</span>
                {t("cart.parcelsNote", { n: parcels.length })}
              </p>
            )}

            {parcels.map(([slug, storeLines], index) => {
              const store = stores.find((s) => s.slug === slug);
              const storeName = store?.name ?? (slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Banaadir Mall");
              return (
                <section key={slug || "none"} className="card overflow-hidden">
                  <header className="flex items-center gap-3 border-b border-sand-100 bg-sand-50/60 px-4 py-3">
                    <StoreAvatar
                      store={store ?? { name: storeName, icon: "🏪" }}
                      size={32}
                      className="h-8 w-8 shrink-0 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      {store ? (
                        <Link
                          href={`/store/${store.slug}`}
                          className="block truncate text-sm font-bold text-ocean-950 hover:text-ocean-700"
                        >
                          {t("cart.soldBy", { store: storeName })}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-bold text-ocean-950">
                          {t("cart.soldBy", { store: storeName })}
                        </p>
                      )}
                    </div>
                    {parcels.length > 1 && (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-sand-200">
                        {t("cart.parcel", { n: index + 1, total: parcels.length })}
                      </span>
                    )}
                  </header>

                  <ParcelOffers store={pricing?.stores[slug]} />

                  <ul className="divide-y divide-sand-100">
                    {storeLines.map((line) => (
                      <li key={cartLineKey(line)} className="flex gap-3 p-4 sm:gap-4">
                        <Link
                          href={`/product/${line.product.slug}`}
                          className="shrink-0"
                          aria-label={line.product.name}
                        >
                          <ProductImage
                            product={line.product}
                            iconClass="text-3xl"
                            className="h-20 w-20 rounded-xl sm:h-24 sm:w-24"
                            sizes="96px"
                          />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/product/${line.product.slug}`}
                                className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 hover:text-ocean-700"
                              >
                                {line.product.name}
                              </Link>
                              {(line.color || line.size) && (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {[line.color, line.size].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            <LinePrice
                              line={pricedLine(cartLineKey(line))}
                              fallbackTotal={line.product.price * line.qty}
                              unitPrice={line.product.price}
                              qty={line.qty}
                            />
                          </div>

                          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
                            <div className="flex items-center rounded-full border border-sand-200 bg-white">
                              <button
                                type="button"
                                aria-label={line.qty === 1 ? t("cart.remove") : t("cart.qtyDec")}
                                onClick={() =>
                                  line.qty === 1
                                    ? removeFromCart(cartLineKey(line))
                                    : updateQty(cartLineKey(line), line.qty - 1)
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-slate-600 hover:bg-sand-100"
                              >
                                {line.qty === 1 ? (
                                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" />
                                  </svg>
                                ) : (
                                  "−"
                                )}
                              </button>
                              <span className="w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                aria-label={t("cart.qtyInc")}
                                onClick={() => updateQty(cartLineKey(line), line.qty + 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-slate-600 hover:bg-sand-100"
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isWishlisted(line.productId)) toggleWishlist(line.productId, line.product);
                                removeFromCart(cartLineKey(line));
                              }}
                              className="text-xs font-semibold text-ocean-700 hover:underline"
                            >
                              ♡ {t("cart.save")}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFromCart(cartLineKey(line))}
                              className="text-xs font-semibold text-slate-500 hover:text-coral-600 hover:underline"
                            >
                              {t("cart.remove")}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {/* On a phone the summary is a long scroll away; the meter sits
                under the items (below them, so its late arrival moves nothing). */}
            <div className="lg:hidden">
              <FreeDeliveryMeter />
            </div>

            <Link href="/products" className="block text-center text-sm font-semibold text-ocean-700 hover:underline sm:hidden">
              ← {t("cart.continue")}
            </Link>
          </div>

          {/* Order summary */}
          <aside className="self-start lg:sticky lg:top-40">
            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-ocean-950">{t("cart.summary")}</h2>

              <div className="mt-4 rounded-xl bg-sand-50 px-3 py-2.5 ring-1 ring-sand-100">
                <DeliveryCity delivery={settings.delivery} variant="bar" />
              </div>

              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">
                    {t("cart.subtotal")} · {itemCount}
                  </dt>
                  <dd className="font-semibold tabular-nums">{money(listTotal)}</dd>
                </div>
                <DiscountRows pricing={pricing} promo={promoStatus} code={applied} pct={promo.pct} onRemove={clearPromo} />
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("cart.delivery")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {delivery === 0 ? <span className="text-emerald-600">{t("cart.free")}</span> : money(delivery)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-sand-200 pt-3">
                  <dt className="font-bold text-ocean-950">{t("cart.total")}</dt>
                  <dd className="font-display text-2xl font-extrabold tabular-nums text-ocean-950">{money(total)}</dd>
                </div>
              </dl>

              {/* Collapsed by default: an open code box tells everyone
                  without a code that they are paying more than somebody. */}
              {!applied && (
                <div className="mt-3">
                  {promoOpen ? (
                    <form onSubmit={applyPromo} className="animate-fade-up">
                      <div className="flex gap-2">
                        <input
                          value={promoInput}
                          onChange={(e) => {
                            setPromoInput(e.target.value);
                            setPromoError(false);
                          }}
                          placeholder={t("cart.promoPlaceholder")}
                          aria-label={t("cart.promoPlaceholder")}
                          aria-invalid={promoError}
                          autoCapitalize="characters"
                          autoFocus
                          className={`input !py-2.5 uppercase ${promoError ? "!border-coral-500" : ""}`}
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-xl bg-ocean-700 px-4 text-sm font-bold text-white hover:bg-ocean-800"
                        >
                          {t("cart.apply")}
                        </button>
                      </div>
                      {promoError && (
                        <p className="mt-1.5 text-xs font-semibold text-coral-600" role="alert">
                          {t("cart.promoInvalid")}
                        </p>
                      )}
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPromoOpen(true)}
                      className="text-sm font-semibold text-ocean-700 hover:underline"
                    >
                      🏷️ {t("cart.promoAsk")}
                    </button>
                  )}
                </div>
              )}
              {pricing && pricing.offerDiscount + pricing.promoDiscount > 0 && (
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700">
                  🎉 {t("offer.saved", { amount: money(pricing.offerDiscount + pricing.promoDiscount) })}
                </p>
              )}

              <Link href="/checkout" className="btn-primary mt-5 w-full !py-3.5 text-base">
                🔒 {t("cart.checkout")}
              </Link>

              <ul className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-medium leading-tight text-slate-500">
                <li className="flex flex-col items-center gap-1">
                  <span className="text-lg" aria-hidden>🔒</span>
                  {t("cart.trust.secure")}
                </li>
                <li className="flex flex-col items-center gap-1">
                  <span className="text-lg" aria-hidden>💵</span>
                  {t("cart.trust.cod")}
                </li>
                <li className="flex flex-col items-center gap-1">
                  <span className="text-lg" aria-hidden>↩️</span>
                  {t("cart.trust.returns")}
                </li>
              </ul>
            </div>

            {/* Replaces the old "add $X more for free delivery" line: same
                real threshold, but it now names things worth buying that
                actually close the gap. See components/reco. */}
            <div className="hidden lg:block">
              <FreeDeliveryMeter />
            </div>
          </aside>
        </div>
      </div>

      {/* Phone: the total and the way forward, always in reach. Sits on the
          tab bar, like the product page's Add to Cart bar. */}
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t border-sand-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-500">
              {t("cart.total")} · {itemCount}
            </p>
            <p className="font-display text-lg font-extrabold leading-tight tabular-nums text-ocean-950">
              {money(total)}
            </p>
          </div>
          <Link href="/checkout" className="btn-primary shrink-0 !px-6">
            {t("cart.checkout")} →
          </Link>
        </div>
      </div>

      <RecoStack surface="cart" useCartLines />
      {/* Room for the sticky bar so the last shelf isn't hidden under it. */}
      <div className="h-20 md:hidden" aria-hidden />
    </div>
  );
}

/** Holds the page's shape while the basket is read from the device. */
export function CartSkeleton() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pt-6 sm:pt-8" aria-busy="true">
      <div className="mb-5 h-8 w-48 animate-pulse rounded-lg bg-sand-100" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-sand-100" />
          ))}
        </div>
        <div className="hidden h-80 animate-pulse rounded-2xl bg-sand-100 lg:block" />
      </div>
    </div>
  );
}

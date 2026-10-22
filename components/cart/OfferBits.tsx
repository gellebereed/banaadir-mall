"use client";

import Link from "next/link";
import { useT } from "@/components/prefs/PrefsProvider";
import type { PromoStatus } from "@/lib/cart-pricing";
import { money } from "@/lib/format";
import { nudgeText, offerHeadline, type CartPricing, type LinePricing, type StorePricing } from "@/lib/offers";

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
export function ParcelOffers({ store, compact = false }: { store?: StorePricing; compact?: boolean }) {
  const t = useT();
  if (!store || (store.applied.length === 0 && store.nudges.length === 0)) return null;
  return (
    <div className={`space-y-1.5 ${compact ? "mb-2" : "border-b border-sand-100 px-4 py-3"}`}>
      {store.applied.map((a) => (
        <p key={a.offer.id} className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-700">
          <span className="min-w-0 truncate">🎁 {offerHeadline(a.offer, t, money)}</span>
          <span className="shrink-0">{t("offer.saved", { amount: money(a.discount) })}</span>
        </p>
      ))}
      {store.nudges.map((n) => (
        <p
          key={n.offer.id + n.kind}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-mango-500/10 px-3 py-2 text-xs font-semibold text-ocean-900"
        >
          <span>💡 {nudgeText(n, t, money)}</span>
          {!compact && (
            <Link href={`/products?store=${store.store}`} className="shrink-0 font-bold text-ocean-700 hover:underline">
              {t("offer.shopItems")} →
            </Link>
          )}
        </p>
      ))}
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
  return (
    <>
      {pricing && pricing.offerDiscount > 0 && (
        <div className="flex justify-between text-emerald-700">
          <dt>🎁 {t("offer.offersLine")}</dt>
          <dd className="font-semibold tabular-nums">−{money(pricing.offerDiscount)}</dd>
        </div>
      )}
      {code && (
        <div className="text-emerald-700">
          <div className="flex justify-between">
            <dt className="flex items-center gap-2">
              {t("cart.discount", { code, pct })}
              <button
                type="button"
                onClick={onRemove}
                className="text-[11px] font-semibold text-slate-400 underline hover:text-coral-600"
              >
                {t("cart.remove")}
              </button>
            </dt>
            <dd className="font-semibold tabular-nums">
              {pricing ? `−${money(pricing.promoDiscount)}` : "…"}
            </dd>
          </div>
          {/* The code is the shops' to honour — say plainly where it doesn't. */}
          {pricing && promo?.valid && accepting === 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">{t("offer.promoNotHere", { code })}</p>
          )}
          {pricing && promo?.valid && accepting > 0 && accepting < shops.length && (
            <p className="mt-1 text-xs font-medium text-slate-500">{t("offer.promoSome", { n: accepting })}</p>
          )}
        </div>
      )}
    </>
  );
}

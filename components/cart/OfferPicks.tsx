"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import { priceCart, type Nudge, type PricingLine } from "@/lib/offers";
import type { OfferPick } from "@/lib/offer-picks";
import type { Offer } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  "PICK YOUR $1 ITEM" — the products that complete an offer, priced.
 * ─────────────────────────────────────────────────────────────────────────
 * Under a nudge like "Add one more item up to $49 and get it for $1". It
 * used to end in a link to the shop's whole catalogue, leaving the shopper
 * to work out which items qualified — the same price or cheaper, at full
 * price where the offer says so, in stock.
 *
 * Every candidate here is priced by ADDING IT TO THE BASKET and running the
 * same engine checkout uses (lib/offers.ts#priceCart). So "$49 → $1" is
 * exactly what the cart will show once it's added, for every kind of offer
 * — no per-offer rules that could drift from the real ones.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Asked once per set of offers, shared by every nudge on the page. */
const picksCache = new Map<string, Promise<Record<string, OfferPick[]>>>();

function fetchPicks(ids: string[]): Promise<Record<string, OfferPick[]>> {
  const key = [...ids].sort().join(",");
  if (!picksCache.has(key)) {
    picksCache.set(
      key,
      fetch(`/api/offers/picks?ids=${encodeURIComponent(key)}`)
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => {
          picksCache.delete(key);
          return {};
        }),
    );
  }
  return picksCache.get(key)!;
}

/** The candidates for these offers; empty until they arrive. */
export function useOfferPicks(offerIds: string[]): Record<string, OfferPick[]> {
  const key = [...new Set(offerIds)].sort().join(",");
  const [picks, setPicks] = useState<Record<string, OfferPick[]>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetchPicks(key.split(",")).then((result) => live && setPicks(result));
    return () => {
      live = false;
    };
  }, [key]);
  return picks;
}

export interface PickedCandidate {
  pick: OfferPick;
  /** What this item would cost once added, after the offer. */
  pay: number;
  /** How much more the shop's offers save with it in the basket. */
  gain: number;
}

/**
 * Each candidate priced by adding one to the basket, in three bands:
 *   1. it becomes the discounted item itself ("$25 → $1") — what the offer
 *      is about, so it leads;
 *   2. adding it discounts something already in the basket;
 *   3. it only counts towards the offer.
 * Within a band the bigger saving first, then the cheaper item, then best
 * sellers. Ranking on the
 * saving alone put a $299 phone ahead of a $25 power bank under "get the
 * next one for $1", because the phone made the earbuds $1 — true, and
 * useless advice.
 */
export function rankCandidates(
  picks: OfferPick[],
  basket: PricingLine[],
  offers: Offer[],
  store: string,
): PickedCandidate[] {
  // A coupon offer is only here because its code was entered and confirmed
  // (useCartPricing) — the engine skips coded offers unless told so.
  const options = { codes: offers.flatMap((o) => (o.code ? [o.code] : [])) };
  const before = priceCart(basket, offers, options).stores[store]?.offerDiscount ?? 0;
  const ranked = picks.map((pick, order) => {
    const key = `pick:${pick.id}`;
    const after = priceCart(
      [
        ...basket,
        {
          key,
          productId: pick.id,
          store: pick.store,
          price: pick.price,
          qty: 1,
          onSale: (pick.compareAt ?? 0) > pick.price,
        },
      ],
      offers,
      options,
    );
    return {
      pick,
      order,
      pay: after.lines[key]?.total ?? pick.price,
      gain: Math.round(((after.stores[store]?.offerDiscount ?? 0) - before) * 100) / 100,
    };
  });
  const band = (c: { pick: OfferPick; pay: number; gain: number }) =>
    ownSaving(c) ? 0 : c.gain > 0 ? 1 : 2;
  return ranked
    // Equal savings: the cheaper item — "the least you can add to get it".
    .sort((a, b) => band(a) - band(b) || b.gain - a.gain || a.pick.price - b.pick.price || a.order - b.order)
    .map(({ pick, pay, gain }) => ({ pick, pay, gain }));
}

/**
 * The whole saving lands on this item — "$25 → $1". A "spend $100, save
 * $15" offer spreads its saving over the basket, so the item alone would
 * read "$27 → $23.18": true, and baffling. Those say "Saves you $15".
 */
export function ownSaving(candidate: PickedCandidate): boolean {
  const off = candidate.pick.price - candidate.pay;
  return candidate.gain > 0 && off > 0.005 && Math.abs(off - candidate.gain) < 0.02;
}

/** How far along the offer is, for the little bar — or null when it has no "amount". */
export function nudgeProgress(nudge: Nudge, basket: PricingLine[]): { done: number; of: number; money: boolean } | null {
  const { offer } = nudge;
  const inScope = basket
    .filter((l) => l.store === offer.store && (!offer.productIds?.length || offer.productIds.includes(l.productId)))
    .filter((l) => !(offer.fullPriceOnly && l.onSale));
  const units = inScope.reduce((t, l) => t + l.qty, 0);
  const spent = inScope.reduce((t, l) => t + l.price * l.qty, 0);
  switch (nudge.kind) {
    case "next":
      return { done: units % 2, of: 2, money: false };
    case "bxgy":
    case "mix":
    case "tiers":
      return { done: units, of: units + nudge.more, money: false };
    case "spend":
    case "giftSpend":
      return { done: spent, of: spent + nudge.more, money: true };
    default:
      return null;
  }
}

/**
 * The row of candidates under one nudge. `compact` on checkout: three, no
 * "see all" — the shopper is paying, not browsing, and one tap is plenty.
 */
export default function OfferPicks({
  nudge,
  picks,
  basket,
  offers,
  compact = false,
}: {
  nudge: Nudge;
  picks: OfferPick[] | undefined;
  basket: PricingLine[];
  /** Every offer the basket is priced with — the simulation must match. */
  offers: Offer[];
  compact?: boolean;
}) {
  const t = useT();
  const { addToCart } = useCart();
  const [added, setAdded] = useState<string | null>(null);
  const offer = nudge.offer;

  const ranked = useMemo(() => {
    if (!picks) return [];
    // "Add one more item up to $49": show exactly what the sentence says.
    const fitting = nudge.kind === "next" ? picks.filter((p) => p.price <= nudge.upTo + 0.005) : picks;
    return rankCandidates(fitting, basket, offers, offer.store);
  }, [picks, basket, offers, offer.store, nudge]);
  const shown = ranked.slice(0, compact ? 3 : 8);
  if (!picks) return <div className="mt-2 h-24 animate-pulse rounded-xl bg-sand-100/70" aria-hidden />;
  if (shown.length === 0) return null;

  function add(candidate: PickedCandidate) {
    const { pick } = candidate;
    addToCart({
      productId: pick.id,
      qty: 1,
      snapshot: {
        name: pick.name,
        price: pick.price,
        icon: pick.icon,
        slug: pick.slug,
        store: pick.store,
        image: pick.image,
        compareAt: pick.compareAt,
      },
    });
    setAdded(pick.id);
    setTimeout(() => setAdded((current) => (current === pick.id ? null : current)), 1600);
  }

  return (
    <div className="mt-2">
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {shown.map((candidate) => {
          const { pick, pay, gain } = candidate;
          const discounted = ownSaving(candidate);
          return (
            <div
              key={pick.id}
              className={`flex shrink-0 snap-start flex-col rounded-xl border border-sand-200 bg-white p-2 ${compact ? "w-28" : "w-32"}`}
            >
              <Link href={`/product/${pick.slug}`} className="relative block aspect-square overflow-hidden rounded-lg bg-sand-50">
                {pick.image ? (
                  <Image src={pick.image} alt="" fill sizes="128px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-3xl">{pick.icon}</span>
                )}
              </Link>
              <Link
                href={`/product/${pick.slug}`}
                className="mt-1.5 line-clamp-2 min-h-[2rem] text-[11px] font-semibold leading-tight text-slate-700 hover:text-ocean-700"
              >
                {pick.name}
              </Link>
              <div className="mt-1 text-xs tabular-nums">
                {discounted ? (
                  <>
                    <span className="mr-1 text-[10px] text-slate-400 line-through">{money(pick.price)}</span>
                    <span className="font-extrabold text-emerald-700">{money(pay)}</span>
                  </>
                ) : (
                  <span className="font-bold text-ocean-950">{money(pick.price)}</span>
                )}
              </div>
              <p className="min-h-[1rem] text-[10px] font-semibold leading-tight text-emerald-700">
                {gain > 0 && !discounted
                  ? t("offer.pick.saves", { amount: money(gain) })
                  : gain <= 0
                    ? <span className="text-slate-400">{t("offer.pick.counts")}</span>
                    : null}
              </p>
              {pick.needsChoice ? (
                <Link
                  href={`/product/${pick.slug}`}
                  className="mt-1.5 rounded-full border border-ocean-700 py-1 text-center text-[11px] font-bold text-ocean-700 hover:bg-ocean-50"
                >
                  {t("offer.pick.choose")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => add(candidate)}
                  className="mt-1.5 rounded-full bg-ocean-700 py-1 text-[11px] font-bold text-white transition hover:bg-mango-500 active:scale-95"
                >
                  {added === pick.id ? t("offer.pick.added") : t("offer.pick.add")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* The full list — not for coupon offers, which have no public page. */}
      {!compact && !offer.code && ranked.length > shown.length && (
        <Link
          href={`/offer/${offer.id}${nudge.kind === "next" ? `?upTo=${nudge.upTo}` : ""}`}
          className="mt-1 inline-block text-[11px] font-bold text-ocean-700 hover:underline"
        >
          {t("offer.pick.seeAll", { n: ranked.length })} →
        </Link>
      )}
    </div>
  );
}

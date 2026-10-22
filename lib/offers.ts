/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHOP OFFERS — one pricing function for every basket.
 * ─────────────────────────────────────────────────────────────────────────
 * "Buy one, get the next for $1", "40% off the next", "buy 2 get 1 free",
 * "3+ items 10% off", "spend $60 save $10". These depend on what ELSE is in
 * the basket, so they can't live on a product's price the way a Promotion
 * does. They are worked out here, from the basket, by one pure function
 * that the cart, checkout, the server and the shop counter all call — so
 * the price a shopper is shown is the price they are charged.
 *
 * The rules, decided once:
 *   • Offers never combine on the same item. Each unit is used by at most
 *     one offer (as the item that unlocks it OR the one discounted).
 *   • When several offers could apply, the one saving the customer most is
 *     taken first, then the next best on what is left, and so on.
 *   • A paired discount always goes to the cheaper item: units are ranked
 *     by price, high to low, and take turns — full, discounted, full, …
 *   • A shop's offer only ever touches that shop's items, and the shop pays
 *     for it.
 *   • The marketplace promo code applies to shops that accepted it, on
 *     items no shop offer has already discounted.
 *
 * No I/O here — it is imported by client components too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { T } from "./i18n";
import type { Offer } from "./types";

export interface PricingLine {
  /** Unique per cart line (the product id — one line per product). */
  key: string;
  productId: string;
  store: string;
  /** Today's unit price (after any price promotion). */
  price: number;
  qty: number;
  /** Already marked down — excluded from "full price only" offers. */
  onSale?: boolean;
}

export interface UnitPrice {
  listPrice: number;
  price: number;
  /** Offer id, or "promo" for the marketplace code. */
  offerId?: string;
  offerName?: string;
}

export interface LinePricing {
  key: string;
  units: UnitPrice[];
  listTotal: number;
  total: number;
  discount: number;
}

export type Nudge =
  | { kind: "next"; offer: Offer; upTo: number }
  | { kind: "bxgy"; offer: Offer; more: number }
  | { kind: "tiers"; offer: Offer; more: number; pct: number }
  | { kind: "spend"; offer: Offer; more: number };

export interface StorePricing {
  store: string;
  listTotal: number;
  total: number;
  /** Saved through the shop's own offers. */
  offerDiscount: number;
  /** Saved through the marketplace promo code. */
  promoDiscount: number;
  applied: { offer: Offer; discount: number }[];
  /** "Add one more…" — at most two, the most valuable first. */
  nudges: Nudge[];
}

export interface CartPricing {
  lines: Record<string, LinePricing>;
  stores: Record<string, StorePricing>;
  listTotal: number;
  offerDiscount: number;
  promoDiscount: number;
  total: number;
}

export interface PromoInput {
  code: string;
  pct: number;
  /** Shops that accepted the code. */
  stores: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isOfferLive(offer: Offer, now = new Date()): boolean {
  if (!offer.active) return false;
  if (offer.startsAt && new Date(offer.startsAt) > now) return false;
  if (offer.endsAt && new Date(offer.endsAt) < now) return false;
  return true;
}

/** Does `offer` cover this product at all (ignoring price conditions)? */
export function offerCovers(offer: Offer, productId: string, store: string): boolean {
  return offer.store === store && (!offer.productIds?.length || offer.productIds.includes(productId));
}

interface Unit {
  idx: number;
  key: string;
  productId: string;
  price: number;
  onSale: boolean;
}

interface Evaluation {
  /** unit idx → discount */
  discounts: Map<number, number>;
  /** Every unit the offer consumed, discounted or not. */
  used: number[];
  total: number;
}

/** Highest price first; ties keep basket order so results are stable. */
const byPriceDesc = (a: Unit, b: Unit) => b.price - a.price || a.idx - b.idx;

function evaluate(offer: Offer, units: Unit[]): Evaluation {
  const discounts = new Map<number, number>();
  const used: number[] = [];
  const pool = units.filter(
    (u) =>
      u.price > 0 &&
      (!offer.productIds?.length || offer.productIds.includes(u.productId)) &&
      !(offer.fullPriceOnly && u.onSale),
  );
  const limit = offer.maxPerOrder && offer.maxPerOrder > 0 ? offer.maxPerOrder : Infinity;
  const sorted = [...pool].sort(byPriceDesc);

  switch (offer.kind) {
    case "next_fixed":
    case "next_pct": {
      const pairs = Math.min(Math.floor(sorted.length / 2), limit);
      for (let i = 0; i < pairs; i++) {
        const trigger = sorted[2 * i];
        const target = sorted[2 * i + 1];
        const off =
          offer.kind === "next_fixed"
            ? Math.max(0, target.price - Math.max(0, offer.price ?? 0))
            : (target.price * clampPct(offer.pct)) / 100;
        used.push(trigger.idx, target.idx);
        discounts.set(target.idx, round2(off));
      }
      break;
    }
    case "bxgy": {
      const buy = Math.max(1, Math.floor(offer.buy ?? 1));
      const get = Math.max(1, Math.floor(offer.get ?? 1));
      const pct = offer.pct === undefined ? 100 : clampPct(offer.pct);
      const groups = Math.min(Math.floor(sorted.length / (buy + get)), limit);
      for (let g = 0; g < groups; g++) {
        const group = sorted.slice(g * (buy + get), (g + 1) * (buy + get));
        group.forEach((u, i) => {
          used.push(u.idx);
          if (i >= buy) discounts.set(u.idx, round2((u.price * pct) / 100));
        });
      }
      break;
    }
    case "tiers": {
      const tier = bestTier(offer, sorted.length);
      if (tier) {
        for (const u of sorted) {
          used.push(u.idx);
          discounts.set(u.idx, round2((u.price * clampPct(tier.pct)) / 100));
        }
      }
      break;
    }
    case "spend": {
      const sum = sorted.reduce((total, u) => total + u.price, 0);
      if (sum > 0 && sum >= (offer.minSpend ?? 0)) {
        const off = offer.amountOff
          ? Math.min(offer.amountOff, sum)
          : (sum * clampPct(offer.pct)) / 100;
        // Spread across the units in proportion to price, so a returned
        // item refunds its fair share. The last unit takes the rounding.
        let left = round2(off);
        sorted.forEach((u, i) => {
          used.push(u.idx);
          const share = i === sorted.length - 1 ? left : round2((off * u.price) / sum);
          left = round2(left - share);
          discounts.set(u.idx, share);
        });
      }
      break;
    }
  }

  let total = 0;
  for (const value of discounts.values()) total += value;
  return { discounts, used, total: round2(total) };
}

function bestTier(offer: Offer, count: number) {
  return [...(offer.tiers ?? [])]
    .filter((t) => t.minQty > 0 && t.pct > 0 && count >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
}

function clampPct(pct: number | undefined): number {
  return Math.min(100, Math.max(0, pct ?? 0));
}

/** What would make the offer pay out (more), given the shop's items. */
function nudgeFor(offer: Offer, units: Unit[], applied: number): Nudge | null {
  const pool = units
    .filter(
      (u) =>
        u.price > 0 &&
        (!offer.productIds?.length || offer.productIds.includes(u.productId)) &&
        !(offer.fullPriceOnly && u.onSale),
    )
    .sort(byPriceDesc);
  if (pool.length === 0) return null;
  const limit = offer.maxPerOrder && offer.maxPerOrder > 0 ? offer.maxPerOrder : Infinity;

  switch (offer.kind) {
    case "next_fixed":
    case "next_pct": {
      if (pool.length % 2 === 0 || Math.floor(pool.length / 2) >= limit) return null;
      return { kind: "next", offer, upTo: pool[pool.length - 1].price };
    }
    case "bxgy": {
      const size = Math.max(1, offer.buy ?? 1) + Math.max(1, offer.get ?? 1);
      const rest = pool.length % size;
      if (rest === 0 || Math.floor(pool.length / size) >= limit) return null;
      return { kind: "bxgy", offer, more: size - rest };
    }
    case "tiers": {
      const next = [...(offer.tiers ?? [])]
        .filter((t) => t.minQty > pool.length && t.pct > 0)
        .sort((a, b) => a.minQty - b.minQty)[0];
      return next ? { kind: "tiers", offer, more: next.minQty - pool.length, pct: next.pct } : null;
    }
    case "spend": {
      if (applied > 0) return null;
      const sum = pool.reduce((total, u) => total + u.price, 0);
      const min = offer.minSpend ?? 0;
      return sum < min ? { kind: "spend", offer, more: round2(min - sum) } : null;
    }
  }
}

/**
 * Price a basket.
 *
 * Per shop: evaluate every live offer on the units still free, take the
 * one saving most, mark its units used, repeat until nothing pays. Then
 * the marketplace code on whatever no offer touched, if the shop accepted
 * it.
 */
export function priceCart(
  lines: PricingLine[],
  offers: Offer[],
  options: { promo?: PromoInput | null; now?: Date } = {},
): CartPricing {
  const now = options.now ?? new Date();
  const live = offers.filter((o) => isOfferLive(o, now));
  const promo = options.promo && options.promo.pct > 0 ? options.promo : null;

  const units: Unit[] = [];
  for (const line of lines) {
    for (let q = 0; q < Math.max(0, Math.floor(line.qty)); q++) {
      units.push({
        idx: units.length,
        key: line.key,
        productId: line.productId,
        price: round2(Math.max(0, line.price)),
        onSale: Boolean(line.onSale),
      });
    }
  }
  const storeOf = new Map(lines.map((l) => [l.key, l.store]));

  const result = new Map<number, UnitPrice>();
  const stores: Record<string, StorePricing> = {};

  for (const store of new Set(lines.map((l) => l.store))) {
    const storeUnits = units.filter((u) => storeOf.get(u.key) === store);
    const consumed = new Set<number>();
    const applied: StorePricing["applied"] = [];
    const appliedTotals = new Map<string, number>();
    let remaining = live.filter((o) => o.store === store);

    while (remaining.length > 0) {
      const free = storeUnits.filter((u) => !consumed.has(u.idx));
      let best: { offer: Offer; ev: Evaluation } | null = null;
      for (const offer of remaining) {
        const ev = evaluate(offer, free);
        if (ev.total > 0 && (!best || ev.total > best.ev.total)) best = { offer, ev };
      }
      if (!best) break;
      for (const idx of best.ev.used) consumed.add(idx);
      for (const [idx, off] of best.ev.discounts) {
        const unit = units[idx];
        result.set(idx, {
          listPrice: unit.price,
          price: round2(unit.price - off),
          offerId: best.offer.id,
          offerName: best.offer.name,
        });
      }
      applied.push({ offer: best.offer, discount: best.ev.total });
      appliedTotals.set(best.offer.id, best.ev.total);
      remaining = remaining.filter((o) => o.id !== best!.offer.id);
    }

    let promoDiscount = 0;
    if (promo && promo.stores.includes(store)) {
      for (const unit of storeUnits) {
        // Not on anything an offer used — the item that unlocked a deal is
        // part of that deal.
        if (consumed.has(unit.idx)) continue;
        const off = round2((unit.price * promo.pct) / 100);
        if (off <= 0) continue;
        promoDiscount += off;
        result.set(unit.idx, {
          listPrice: unit.price,
          price: round2(unit.price - off),
          offerId: "promo",
          offerName: `Promo ${promo.code}`,
        });
      }
    }

    const nudges = live
      .filter((o) => o.store === store)
      .map((o) => nudgeFor(o, storeUnits, appliedTotals.get(o.id) ?? 0))
      .filter((n): n is Nudge => n !== null)
      .slice(0, 2);

    const listTotal = round2(storeUnits.reduce((t, u) => t + u.price, 0));
    const offerDiscount = round2(applied.reduce((t, a) => t + a.discount, 0));
    stores[store] = {
      store,
      listTotal,
      offerDiscount,
      promoDiscount: round2(promoDiscount),
      total: round2(listTotal - offerDiscount - promoDiscount),
      applied,
      nudges,
    };
  }

  const linesOut: Record<string, LinePricing> = {};
  for (const line of lines) {
    const lineUnits = units
      .filter((u) => u.key === line.key)
      .map((u) => result.get(u.idx) ?? { listPrice: u.price, price: u.price });
    const listTotal = round2(lineUnits.reduce((t, u) => t + u.listPrice, 0));
    const total = round2(lineUnits.reduce((t, u) => t + u.price, 0));
    linesOut[line.key] = { key: line.key, units: lineUnits, listTotal, total, discount: round2(listTotal - total) };
  }

  const all = Object.values(stores);
  const listTotal = round2(all.reduce((t, s) => t + s.listTotal, 0));
  const offerDiscount = round2(all.reduce((t, s) => t + s.offerDiscount, 0));
  const promoDiscount = round2(all.reduce((t, s) => t + s.promoDiscount, 0));
  return {
    lines: linesOut,
    stores,
    listTotal,
    offerDiscount,
    promoDiscount,
    total: round2(listTotal - offerDiscount - promoDiscount),
  };
}

/**
 * A line's units grouped by what was charged — one order item per price,
 * so "1 × Shirt $75" and "1 × Shirt $1 (Next for $1)" are separate lines a
 * picker and an accountant can both read.
 */
export function groupUnits(line: LinePricing): { qty: number; price: number; listPrice: number; offerName?: string }[] {
  const groups: { qty: number; price: number; listPrice: number; offerName?: string }[] = [];
  for (const unit of line.units) {
    const existing = groups.find((g) => g.price === unit.price && g.offerName === unit.offerName);
    if (existing) existing.qty += 1;
    else groups.push({ qty: 1, price: unit.price, listPrice: unit.listPrice, offerName: unit.offerName });
  }
  return groups;
}

// ── Words ───────────────────────────────────────────────────────────────
// A translator is passed in (lib/i18n), so the same sentences work on the
// server and in the browser.

type Money = (n: number) => string;

/** "Buy 1, get the next for $1" — the badge on a product and in the cart. */
export function offerHeadline(offer: Offer, t: T, money: Money): string {
  switch (offer.kind) {
    case "next_fixed":
      return t("offer.nextFixed", { price: money(offer.price ?? 0) });
    case "next_pct":
      return t("offer.nextPct", { pct: offer.pct ?? 0 });
    case "bxgy":
      return (offer.pct ?? 100) >= 100
        ? t("offer.bxgyFree", { buy: offer.buy ?? 1, get: offer.get ?? 1 })
        : t("offer.bxgyPct", { buy: offer.buy ?? 1, get: offer.get ?? 1, pct: offer.pct ?? 0 });
    case "tiers": {
      const tiers = [...(offer.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
      return tiers.map((tier) => t("offer.tier", { qty: tier.minQty, pct: tier.pct })).join(" · ");
    }
    case "spend":
      return offer.amountOff
        ? t("offer.spendAmount", { min: money(offer.minSpend ?? 0), amount: money(offer.amountOff) })
        : t("offer.spendPct", { min: money(offer.minSpend ?? 0), pct: offer.pct ?? 0 });
  }
}

/** The small print: which items count. */
export function offerTerms(offer: Offer, t: T): string[] {
  const terms: string[] = [];
  if (offer.kind === "next_fixed" || offer.kind === "next_pct") terms.push(t("offer.term.equalOrLower"));
  if (offer.kind === "bxgy") terms.push(t("offer.term.cheapest"));
  if (offer.fullPriceOnly) terms.push(t("offer.term.fullPrice"));
  if (offer.maxPerOrder) terms.push(t("offer.term.limit", { n: offer.maxPerOrder }));
  return terms;
}

/** "Add one more item up to $75 and get it for $1". */
export function nudgeText(nudge: Nudge, t: T, money: Money): string {
  const { offer } = nudge;
  switch (nudge.kind) {
    case "next":
      return offer.kind === "next_fixed"
        ? t("offer.nudge.nextFixed", { upTo: money(nudge.upTo), price: money(offer.price ?? 0) })
        : t("offer.nudge.nextPct", { upTo: money(nudge.upTo), pct: offer.pct ?? 0 });
    case "bxgy":
      return (offer.pct ?? 100) >= 100
        ? t("offer.nudge.bxgyFree", { n: nudge.more })
        : t("offer.nudge.bxgyPct", { n: nudge.more, pct: offer.pct ?? 0 });
    case "tiers":
      return t("offer.nudge.tiers", { n: nudge.more, pct: nudge.pct });
    case "spend":
      return offer.amountOff
        ? t("offer.nudge.spendAmount", { more: money(nudge.more), amount: money(offer.amountOff) })
        : t("offer.nudge.spendPct", { more: money(nudge.more), pct: offer.pct ?? 0 });
  }
}

/**
 * Check a seller's offer before it is saved. Returns a reason it can't be,
 * or null. The server runs this; the builder runs it to explain early.
 */
export function offerProblem(offer: Offer): string | null {
  const pctOk = (n?: number) => typeof n === "number" && n > 0 && n <= 100;
  switch (offer.kind) {
    case "next_fixed":
      if (typeof offer.price !== "number" || offer.price < 0) return "Set what the next item costs.";
      break;
    case "next_pct":
      if (!pctOk(offer.pct)) return "Set a discount between 1% and 100%.";
      break;
    case "bxgy":
      if (!offer.buy || offer.buy < 1 || !offer.get || offer.get < 1) return "Set how many to buy and how many they get.";
      if (!pctOk(offer.pct)) return "Set a discount between 1% and 100%.";
      break;
    case "tiers":
      if (!offer.tiers?.length || offer.tiers.some((t) => t.minQty < 2 || !pctOk(t.pct)))
        return "Each tier needs 2 or more items and a discount between 1% and 100%.";
      break;
    case "spend":
      if (!offer.minSpend || offer.minSpend <= 0) return "Set how much the customer must spend.";
      if (!(offer.amountOff && offer.amountOff > 0) && !pctOk(offer.pct)) return "Set the saving — an amount or a percentage.";
      if (offer.amountOff && offer.amountOff >= offer.minSpend) return "The saving must be less than the amount spent.";
      break;
    default:
      return "Unknown offer type.";
  }
  if (offer.startsAt && offer.endsAt && new Date(offer.startsAt) >= new Date(offer.endsAt))
    return "The end date must come after the start date.";
  return null;
}

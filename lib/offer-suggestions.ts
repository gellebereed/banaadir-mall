/**
 * ─────────────────────────────────────────────────────────────────────────
 *  OFFER SUGGESTIONS — what this shop's own numbers say to try.
 * ─────────────────────────────────────────────────────────────────────────
 * Every suggestion is worked out from the shop's orders and products, and
 * says why in one sentence a shopkeeper would say themselves ("these two
 * are bought together in 6 orders"). A suggestion is only ever a draft:
 * "Use this" loads it into the builder, where the seller sees the preview
 * and decides. Nothing here changes a price by itself.
 *
 * Pure — no I/O; the vendor page passes the data in.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { isOfferLive } from "./offers";
import type { Offer, OfferProductRef, Order, Product } from "./types";

export interface OfferSuggestion {
  id: string;
  icon: string;
  title: string;
  /** One sentence: the number that makes this worth trying. */
  why: string;
  /** Loaded into the builder. */
  draft: Omit<Offer, "id" | "store" | "active" | "name">;
  name?: string;
  /** Limit the offer to these products ("Selected products"). */
  productIds?: string[];
  /** Mogadishu wall-clock "YYYY-MM-DDTHH:mm" for the builder's date fields. */
  startsAt?: string;
  endsAt?: string;
}

const DAY = 86_400_000;
const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/**
 * Dates shoppers here plan around. The Islamic dates follow the moon and
 * can move by a day; a week of lead time absorbs that.
 */
const EVENTS: { name: string; date: string; pitch: string }[] = [
  { name: "Ramadan", date: "2027-02-08", pitch: "families stock up the week before" },
  { name: "Eid al-Fitr", date: "2027-03-10", pitch: "the busiest gift and new-clothes week of the year" },
  { name: "Eid al-Adha", date: "2027-05-17", pitch: "gifts and new clothes for the holiday" },
  { name: "Independence Day", date: "2027-07-01", pitch: "a national celebration worth a deal" },
  { name: "Eid al-Fitr", date: "2026-03-20", pitch: "the busiest gift and new-clothes week of the year" },
  { name: "Eid al-Adha", date: "2026-05-27", pitch: "gifts and new clothes for the holiday" },
  { name: "Independence Day", date: "2026-07-01", pitch: "a national celebration worth a deal" },
  { name: "Ramadan", date: "2028-01-28", pitch: "families stock up the week before" },
  { name: "Eid al-Fitr", date: "2028-02-27", pitch: "the busiest gift and new-clothes week of the year" },
];

const ref = (p: Product): OfferProductRef => ({
  productId: p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  image: p.images?.[0],
  icon: p.icon,
});

/** "2026-03-13T00:00" — a date as the builder's datetime-local field wants it. */
const wallClock = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);

export function suggestOffers({
  products,
  orders,
  offers,
  now = new Date(),
}: {
  products: Product[];
  orders: Order[];
  offers: Offer[];
  now?: Date;
}): OfferSuggestion[] {
  const visible = products.filter((p) => !p.hidden && p.price > 0);
  const byId = new Map(visible.map((p) => [p.id, p]));
  const recent = orders.filter(
    (o) => o.status !== "cancelled" && now.getTime() - Date.parse(o.date) <= 90 * DAY,
  );
  const live = offers.filter((o) => isOfferLive(o, now) || (o.active && o.startsAt));
  const runs = (kind: Offer["kind"]) => live.some((o) => o.kind === kind);
  const out: OfferSuggestion[] = [];

  // ── 1. Bought together → bundle ────────────────────────────────────
  const pairs = new Map<string, number>();
  for (const order of recent) {
    const ids = [...new Set(order.items.map((i) => i.productId))].filter((id) => byId.has(id)).sort();
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const key = `${ids[a]}|${ids[b]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
  }
  const bundled = new Set(live.filter((o) => o.kind === "bundle").flatMap((o) => o.bundle?.map((b) => b.productId) ?? []));
  const topPair = [...pairs.entries()]
    .filter(([key, n]) => n >= 2 && !key.split("|").every((id) => bundled.has(id)))
    .sort((a, b) => b[1] - a[1])[0];
  if (topPair) {
    const [a, b] = topPair[0].split("|").map((id) => byId.get(id)!);
    const sum = a.price + b.price;
    out.push({
      id: `bundle-${a.id}-${b.id}`,
      icon: "🧩",
      title: `Bundle ${a.name} + ${b.name}`,
      why: `Customers bought these two together in ${topPair[1]} orders in the last 90 days — a set price turns that habit into a reason to buy both.`,
      draft: { kind: "bundle", bundle: [ref(a), ref(b)], price: round(sum * 0.9, 1) },
    });
  }

  // ── 2. Slow stock → buy more, save more ────────────────────────────
  if (recent.length > 0) {
    const soldRecently = new Set(recent.flatMap((o) => o.items.map((i) => i.productId)));
    const slow = visible
      .filter((p) => (p.stock ?? 0) >= 5 && !soldRecently.has(p.id))
      .sort((a, b) => (b.stock ?? 0) * b.price - (a.stock ?? 0) * a.price)
      .slice(0, 12);
    if (slow.length >= 2 && !runs("tiers")) {
      const value = slow.reduce((t, p) => t + (p.stock ?? 0) * p.price, 0);
      out.push({
        id: "slow-stock",
        icon: "📦",
        title: "Move slow stock: buy more, save more",
        why: `${slow.length} products haven't sold in 90 days — about $${Math.round(value).toLocaleString("en-US")} of stock sitting still. A quantity deal on just those moves it without marking down everything.`,
        draft: { kind: "tiers", tiers: [{ minQty: 2, pct: 15 }, { minQty: 3, pct: 25 }] },
        productIds: slow.map((p) => p.id),
      });
    }
  }

  // ── 3. Basket size → spend & save ──────────────────────────────────
  if (recent.length >= 5 && !runs("spend")) {
    const avg = recent.reduce((t, o) => t + o.total, 0) / recent.length;
    const target = round(avg * 1.3, 5);
    const save = round(target * 0.08, 1);
    out.push({
      id: "spend-save",
      icon: "🧾",
      title: `Spend $${target}, save $${save}`,
      why: `Your average order is $${avg.toFixed(2)}. A target about 30% above it is in reach for most customers — and every one who reaches it adds an item.`,
      draft: { kind: "spend", minSpend: target, amountOff: save },
    });
  }

  // ── 4. One-item orders → % off the next ────────────────────────────
  const single = recent.filter((o) => o.items.reduce((t, i) => t + i.qty, 0) === 1).length;
  const singleShare = recent.length ? single / recent.length : 0;
  if (recent.length >= 5 && singleShare >= 0.5 && !runs("next_pct") && !runs("next_fixed")) {
    out.push({
      id: "second-item",
      icon: "✂️",
      title: "30% off the second item",
      why: `${Math.round(singleShare * 100)}% of your orders are a single item. A deal on the next one is the simplest way to make that two.`,
      draft: { kind: "next_pct", pct: 30, maxPerOrder: 2 },
    });
  } else if (live.length === 0 && visible.length >= 3 && !out.some((s) => s.draft.kind === "next_pct")) {
    out.push({
      id: "starter",
      icon: "🚀",
      title: "Your first offer: 30% off the second item",
      why: "You have no offers running. Customers look for them — this one is easy to understand and only costs you when a basket grows.",
      draft: { kind: "next_pct", pct: 30, maxPerOrder: 2 },
    });
  }

  // ── 5. The calendar ────────────────────────────────────────────────
  const next = EVENTS.map((e) => ({ ...e, at: Date.parse(`${e.date}T00:00:00+03:00`) }))
    .filter((e) => e.at > now.getTime() && e.at - now.getTime() <= 120 * DAY)
    .sort((a, b) => a.at - b.at)[0];
  if (next) {
    const days = Math.ceil((next.at - now.getTime()) / DAY);
    const start = Math.max(now.getTime(), next.at - 7 * DAY);
    const median = visible.map((p) => p.price).sort((a, b) => a - b)[Math.floor(visible.length / 2)] ?? 20;
    const target = round(median * 2, 5);
    out.push({
      id: `season-${next.date}`,
      icon: "🌙",
      title: `${next.name} in ${days} days — plan a deal`,
      why: `${next.name} is around ${new Date(next.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Mogadishu" })} — ${next.pitch}. Scheduled now, it starts a week before by itself.`,
      name: `${next.name} deal`,
      draft: { kind: "spend", minSpend: target, amountOff: round(target * 0.1, 1) },
      startsAt: wallClock(start),
      endsAt: wallClock(next.at + 3 * DAY),
    });
  }

  return out.slice(0, 5);
}

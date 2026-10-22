/**
 * How one offer has done — from the shop's own recorded orders.
 *
 * "With the offer" means an order (parcel) where at least one item was
 * charged through it. Comparisons are only made against orders from the
 * same period (since the offer was created), so a quiet month before it
 * existed doesn't flatter it.
 */

import type { Offer, Order } from "./types";

export interface OfferResults {
  /** Orders that used the offer. */
  orders: number;
  /** What those orders took, after every discount. */
  revenue: number;
  /** What customers saved through it — the shop's cost. */
  saved: number;
  /** Units charged at the offer price. */
  units: number;
  /** All orders since the offer was created. */
  ordersSince: number;
  /** Average order with the offer vs without, since it was created. */
  avgWith: number | null;
  avgWithout: number | null;
  /** Products most often bought through it. */
  topProducts: { productId: string; name: string; units: number; saved: number }[];
  /** Orders using the offer per day, oldest first. */
  daily: { date: string; orders: number; revenue: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function offerResults(offer: Offer, allOrders: Order[], now = new Date(), days = 30): OfferResults {
  const orders = allOrders.filter((o) => o.status !== "cancelled");
  const since = (offer.createdAt ?? "").slice(0, 10);
  const inPeriod = since ? orders.filter((o) => o.date.slice(0, 10) >= since) : orders;

  // By id; the name is a fallback for orders recorded before ids were kept.
  const usesOffer = (item: Order["items"][number]) =>
    item.offerId === offer.id || (!item.offerId && item.offer === offer.name);

  const withOffer = inPeriod.filter((o) => o.items.some(usesOffer));
  const without = inPeriod.filter((o) => !o.items.some(usesOffer));

  const byProduct = new Map<string, { productId: string; name: string; units: number; saved: number }>();
  let saved = 0;
  let units = 0;
  for (const order of withOffer) {
    for (const item of order.items) {
      if (!usesOffer(item)) continue;
      const off = ((item.listPrice ?? item.price ?? 0) - (item.price ?? 0)) * item.qty;
      saved += off;
      units += item.qty;
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.name ?? item.productId,
        units: 0,
        saved: 0,
      };
      entry.units += item.qty;
      entry.saved += off;
      byProduct.set(item.productId, entry);
    }
  }

  const avg = (list: Order[]) => (list.length ? round2(list.reduce((t, o) => t + o.total, 0) / list.length) : null);

  // A day-by-day row for the chart — every day, zeros included, so a gap
  // reads as "nothing happened" rather than being skipped.
  const daily: OfferResults["daily"] = [];
  const end = Date.parse(now.toISOString().slice(0, 10));
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const today = withOffer.filter((o) => o.date.slice(0, 10) === date);
    daily.push({ date, orders: today.length, revenue: round2(today.reduce((t, o) => t + o.total, 0)) });
  }

  return {
    orders: withOffer.length,
    revenue: round2(withOffer.reduce((t, o) => t + o.total, 0)),
    saved: round2(saved),
    units,
    ordersSince: inPeriod.length,
    avgWith: avg(withOffer),
    avgWithout: avg(without),
    topProducts: [...byProduct.values()]
      .map((p) => ({ ...p, saved: round2(p.saved) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5),
    daily,
  };
}

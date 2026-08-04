/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MOMENTUM — what is moving right now, counted from real orders.
 * ─────────────────────────────────────────────────────────────────────────
 * This is the module that lets the site say "14 bought this week" and mean
 * it. Every number here is a count of order lines in a date window; nothing
 * is simulated, inflated, or seeded to look busy.
 *
 * ── Rising ≠ bestselling ─────────────────────────────────────────────────
 * A bestseller list is the same eight products for months, which is why
 * shoppers stop reading it. What is genuinely interesting — and what makes
 * a home page feel alive between visits — is *acceleration*: what sold more
 * this week than last. That surfaces the new arrival finding its audience
 * and the seasonal item turning over, and it changes on its own without
 * anybody merchandising it.
 *
 * Rising uses the same shrinkage idea as the affinity graph: going from one
 * sale to three is a 200% jump and means nothing, so growth is damped by
 * how much evidence sits behind it.
 *
 * ── City ─────────────────────────────────────────────────────────────────
 * Counts can be scoped to a city, which is what turns a generic "popular"
 * into "popular in Hargeisa this week" — a far more useful claim in a
 * country where availability and taste vary sharply between cities. The
 * city is only ever taken from the shopper's OWN past orders, never from an
 * IP lookup: guessing someone's location and then telling them what their
 * neighbours are buying is both creepier and less accurate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Order } from "../types";

const DAY_MS = 86_400_000;

export interface MomentumEntry {
  /** Units sold in the recent window. */
  units: number;
  /** Baskets that included it in the recent window. */
  orders: number;
  /** Units in the window immediately before. */
  previousUnits: number;
  /** Damped growth rate; >0 means accelerating. */
  rising: number;
}

export interface MomentumIndex {
  entries: Map<string, MomentumEntry>;
  /** Days in the recent window — the number the copy quotes. */
  windowDays: number;
  /** True when there were enough orders for any of this to be meaningful. */
  meaningful: boolean;
  /** City this index was scoped to, when it was scoped at all. */
  city?: string;
}

/** Below this many recent orders, momentum claims are suppressed entirely. */
const MEANINGFUL_ORDER_FLOOR = 5;

/** Growth damping — see the note on shrinkage above. */
const GROWTH_PRIOR = 4;

export function buildMomentum(
  orders: Order[],
  options: { windowDays?: number; city?: string; now?: Date } = {},
): MomentumIndex {
  const windowDays = options.windowDays ?? 7;
  const now = options.now ?? new Date();
  const city = options.city?.trim().toLowerCase();

  const recentFrom = new Date(now.getTime() - windowDays * DAY_MS);
  const priorFrom = new Date(now.getTime() - 2 * windowDays * DAY_MS);

  const entries = new Map<string, MomentumEntry>();
  let recentOrders = 0;

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (city && (order.city ?? "").trim().toLowerCase() !== city) continue;

    const placed = Date.parse(`${(order.date ?? "").slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(placed)) continue;

    const isRecent = placed >= recentFrom.getTime();
    const isPrior = !isRecent && placed >= priorFrom.getTime();
    if (!isRecent && !isPrior) continue;
    if (isRecent) recentOrders++;

    for (const item of order.items ?? []) {
      const entry =
        entries.get(item.productId) ??
        { units: 0, orders: 0, previousUnits: 0, rising: 0 };
      if (isRecent) {
        entry.units += item.qty || 0;
        entry.orders += 1;
      } else {
        entry.previousUnits += item.qty || 0;
      }
      entries.set(item.productId, entry);
    }
  }

  for (const entry of entries.values()) {
    const gain = entry.units - entry.previousUnits;
    const evidence = entry.units + entry.previousUnits;
    // Damped growth: the same +2 counts for much less off a base of 1 than
    // off a base of 20.
    entry.rising = evidence > 0 ? (gain / (evidence + GROWTH_PRIOR)) * Math.log2(1 + entry.units) : 0;
  }

  return {
    entries,
    windowDays,
    meaningful: recentOrders >= MEANINGFUL_ORDER_FLOOR,
    city: options.city,
  };
}

/**
 * Products accelerating fastest, best first. The unit counts come back with
 * them so the card can quote the actual figures rather than repeat the
 * shelf's title in different words.
 */
export function risingProducts(
  index: MomentumIndex,
  limit = 20,
): { id: string; rising: number; units: number; previousUnits: number }[] {
  return [...index.entries.entries()]
    .filter(([, entry]) => entry.rising > 0 && entry.units > 0)
    .map(([id, entry]) => ({
      id,
      rising: entry.rising,
      units: entry.units,
      previousUnits: entry.previousUnits,
    }))
    .sort((a, b) => b.rising - a.rising)
    .slice(0, limit);
}

/**
 * The honest social-proof line, or nothing.
 *
 * Returns undefined when the marketplace simply has not sold enough for the
 * claim to be true — which on a young site is most products, most of the
 * time. Showing "0 bought this week" or padding it with a lifetime figure
 * dressed as a weekly one is exactly the small lie this whole module exists
 * to avoid.
 */
export function momentumLine(index: MomentumIndex, productId: string): string | undefined {
  if (!index.meaningful) return undefined;
  const entry = index.entries.get(productId);
  if (!entry || entry.units < 2) return undefined;

  const period = index.windowDays === 7 ? "this week" : `in ${index.windowDays} days`;
  const where = index.city ? ` in ${index.city}` : "";
  return `${entry.units} bought${where} ${period}`;
}

/**
 * The city the shopper actually shops from, taken from their own most
 * recent order. Returns undefined for anyone who has not ordered — no
 * guessing.
 */
export function shopperCity(orders: Order[], identity: { email?: string; name?: string }): string | undefined {
  const email = identity.email?.trim().toLowerCase();
  const name = identity.name?.trim().toLowerCase();
  if (!email && !name) return undefined;

  const theirs = orders
    .filter((order) => {
      if (email && order.email?.trim().toLowerCase() === email) return true;
      if (!email && name && order.customer?.trim().toLowerCase() === name) return true;
      return false;
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return theirs[0]?.city || undefined;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRE-ORDERS — selling stock that is still on its way.
 * ─────────────────────────────────────────────────────────────────────────
 * A shop buys new stock two weeks before it lands. Until now the only
 * honest options were to list it with stock 0 (a page that says "Sold out"
 * about something nobody has ever been able to buy) or to wait — and lose
 * the two weeks in which its best customers would have reserved theirs.
 *
 * A pre-order product is an ordinary product with three extra facts:
 *
 *   WHEN it arrives        the date the shop expects the shipment
 *   HOW MANY are open      `stock` is the units a shopper can still reserve;
 *                          `total` remembers how many were opened, so the
 *                          page can say "18 of 40 reserved" from real orders
 *   WHAT early buyers get  an optional early price that ends on arrival
 *
 * Everything persuasive on the storefront is built from those facts and
 * nothing else — the same line lib/reco/psychology.ts draws. The countdown
 * counts down to the shop's own date, the "reserved" bar is orders that
 * exist, and the early price really does end when the stock lands (see
 * markPreorderArrived in app/actions.ts), so the deadline is true.
 *
 * Because it stays an ordinary product, an order for it is an ordinary
 * order: same checkout, same stock check, same seller dashboard. Each line
 * is stamped with `preorder.arrivesAt` so the shop knows not to pack it yet
 * and the customer knows when to expect it.
 *
 * Safe to import from client and server.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { totalStock } from "./product-utils";
import type { Preorder, Product } from "./types";

/** "Just landed" is said for this long after the shop marks it arrived. */
export const JUST_LANDED_DAYS = 14;

/** The largest early discount a shop can set — a typo of 500 is not a price. */
export const MAX_EARLY_PCT = 70;

const DAY = 86_400_000;

/** Is this product being sold ahead of its stock right now? */
export function isPreorder(product: Pick<Product, "preorder">): boolean {
  return Boolean(product.preorder?.arrivesAt) && !product.preorder?.arrivedAt;
}

/** Did its pre-ordered stock land in the last two weeks? */
export function justLanded(product: Pick<Product, "preorder">, now = Date.now()): boolean {
  const at = product.preorder?.arrivedAt;
  if (!at) return false;
  const landed = Date.parse(at);
  return Number.isFinite(landed) && now - landed < JUST_LANDED_DAYS * DAY;
}

/**
 * The arrival date as a moment: the END of that day in Mogadishu (UTC+3,
 * no daylight saving). A shipment "arriving on the 25th" is not late at one
 * minute past midnight, and the countdown must not say it is.
 */
export function arrivalTime(arrivesAt: string): number {
  const day = arrivesAt.slice(0, 10);
  const time = Date.parse(`${day}T23:59:59+03:00`);
  return Number.isFinite(time) ? time : NaN;
}

/** Whole days until it arrives — 0 on the day, negative once it is overdue. */
export function daysUntilArrival(arrivesAt: string, now = Date.now()): number {
  const time = arrivalTime(arrivesAt);
  if (!Number.isFinite(time)) return 0;
  return Math.ceil((time - now) / DAY) - 1;
}

const MONTHS: Record<string, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  so: ["Jan", "Feb", "Maa", "Abr", "Maj", "Juun", "Luul", "Ogo", "Seb", "Okt", "Nof", "Des"],
};

/**
 * "25 Nov" / "25 Nov 2027" — the year only when it is not this one.
 *
 * Built by hand rather than with toLocaleDateString: the server and the
 * shopper's phone do not ship the same Somali locale data, and a date that
 * renders differently on each is a hydration error on every pre-order card.
 */
export function arrivalDate(arrivesAt: string, lang: string = "en", now = Date.now()): string {
  const [year, month, day] = arrivesAt.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day || month > 12) return arrivesAt;
  const label = `${day} ${(MONTHS[lang] ?? MONTHS.en)[month - 1]}`;
  // "This year" as Mogadishu sees it (UTC+3).
  const thisYear = new Date(now + 3 * 3_600_000).getUTCFullYear();
  return year === thisYear ? label : `${label} ${year}`;
}

/** How the reservation is going, from the stock that has actually gone. */
export interface PreorderProgress {
  /** Units opened for pre-order. */
  total: number;
  /** Units already reserved by real orders. */
  reserved: number;
  /** Units still open. */
  left: number;
  /** 0–100, for the bar. */
  pct: number;
}

/**
 * Reserved-so-far, or undefined when there is nothing true to say — a
 * product whose total was never recorded, or one nobody has reserved yet
 * ("0 of 40 reserved" is an argument against buying).
 */
export function preorderProgress(product: Product): PreorderProgress | undefined {
  const total = product.preorder?.total ?? 0;
  if (!isPreorder(product) || total <= 0) return undefined;
  const left = Math.min(total, totalStock(product));
  const reserved = total - left;
  if (reserved <= 0) return undefined;
  return { total, reserved, left, pct: Math.round((reserved / total) * 100) };
}

/**
 * What the dashboard form asked for, cleaned — or a sentence saying why it
 * cannot be saved. `today` is the shop's date, "2026-11-11".
 */
export function readPreorder(
  input: { arrivesAt: string; earlyPct: string; note: string },
  today: string,
): { preorder: Pick<Preorder, "arrivesAt" | "earlyPct" | "note"> } | { error: string } {
  const arrivesAt = input.arrivesAt.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivesAt) || Number.isNaN(Date.parse(arrivesAt))) {
    return { error: "Pre-order: choose the date you expect the stock to arrive." };
  }
  if (arrivesAt < today) {
    return {
      error:
        "Pre-order: the arrival date is in the past. If the stock is already here, " +
        "turn pre-order off and sell it as usual.",
    };
  }
  const pctRaw = input.earlyPct.trim();
  const earlyPct = pctRaw ? Math.round(Number(pctRaw)) : 0;
  if (!Number.isFinite(earlyPct) || earlyPct < 0 || earlyPct > MAX_EARLY_PCT) {
    return { error: `Pre-order: the early price must be between 0 and ${MAX_EARLY_PCT}% off.` };
  }
  const note = input.note.trim().slice(0, 140);
  return {
    preorder: {
      arrivesAt,
      ...(earlyPct > 0 ? { earlyPct } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/**
 * Fold a saved form into the product's pre-order record.
 *
 * `total` is the part worth care. It is "units opened", and the seller
 * never types it — they type stock, which is "units still open". So the
 * total is rebuilt as what is open now plus what has already been reserved,
 * which keeps "18 of 40 reserved" true when the shop later finds room for
 * ten more and raises the stock.
 */
export function mergePreorder(
  previous: Product,
  next: Pick<Preorder, "arrivesAt" | "earlyPct" | "note">,
  stockNow: number,
  nowIso: string,
): Preorder {
  const wasLive = isPreorder(previous);
  const reserved = wasLive
    ? Math.max(0, (previous.preorder?.total ?? 0) - totalStock(previous))
    : 0;
  return {
    ...next,
    total: Math.max(0, stockNow) + reserved,
    startedAt: (wasLive && previous.preorder?.startedAt) || nowIso,
  };
}

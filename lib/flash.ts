/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FLASH DEALS — when the campaign is on, and what it takes off.
 * ─────────────────────────────────────────────────────────────────────────
 * The discount belongs to the CAMPAIGN, not to a promotion that outlives
 * it. An approved seller application takes its percentage off only while:
 *   - the campaign is switched on,
 *   - its end time (if any) hasn't passed, and
 *   - the product is still in the campaign.
 * The moment any of those stops being true the price goes back by itself —
 * nobody has to remember to switch a discount off, and the seller never
 * pays for a sale that ended.
 *
 * Pure: no I/O.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parseShopTime } from "./shop-time";
import type { FlashDeal, FlashRequest, Product } from "./types";

export type FlashState = "live" | "paused" | "ended";

export function flashState(flash: FlashDeal, now = Date.now()): FlashState {
  if (!flash.active) return "paused";
  if (flash.endsAt && parseShopTime(flash.endsAt) <= now) return "ended";
  return "live";
}

export const isFlashLive = (flash: FlashDeal, now = Date.now()) => flashState(flash, now) === "live";

/** Has the shop's own end for this application passed? */
export const requestEnded = (r: FlashRequest, now = Date.now()) =>
  Boolean(r.endsAt && parseShopTime(r.endsAt) <= now);

export interface FlashPrice {
  pct: number;
  /** The shop's own end, when it comes before the campaign's. */
  endsAt?: string;
  /** When this price actually stops: the shop's own end, else the campaign's. */
  until?: string;
}

/**
 * Product id → its flash discount right now (empty when the campaign is
 * off). A shop's own end time stops just its product, earlier than the rest.
 */
export function flashDiscounts(flash: FlashDeal, requests: FlashRequest[], now = Date.now()): Map<string, FlashPrice> {
  const out = new Map<string, FlashPrice>();
  if (!isFlashLive(flash, now)) return out;
  const inCampaign = new Set(flash.productIds);
  const campaignEnd = flash.endsAt ? parseShopTime(flash.endsAt) : Infinity;
  for (const r of requests) {
    if (r.status !== "approved" || !inCampaign.has(r.productId) || requestEnded(r, now)) continue;
    if ((out.get(r.productId)?.pct ?? 0) >= r.pct) continue;
    const ownEnd = r.endsAt && parseShopTime(r.endsAt) < campaignEnd ? r.endsAt : undefined;
    out.set(r.productId, { pct: r.pct, endsAt: ownEnd, until: ownEnd ?? (flash.endsAt || undefined) });
  }
  return out;
}

/** Products whose shop-chosen flash end has passed — off the rail. */
export function endedFlashProducts(requests: FlashRequest[], now = Date.now()): Set<string> {
  const live = new Set(requests.filter((r) => r.status === "approved" && !requestEnded(r, now)).map((r) => r.productId));
  return new Set(
    requests.filter((r) => r.status === "approved" && requestEnded(r, now) && !live.has(r.productId)).map((r) => r.productId),
  );
}

/** Old approvals created a promotion with this id; the campaign owns that discount now. */
export const isLegacyFlashPromotion = (id: string) => id.startsWith("promo-flash-");

/** Units a shopper can buy — the variants' total when it has variants. */
export function unitsInStock(p: Pick<Product, "stock" | "variants">): number {
  return p.variants?.length ? p.variants.reduce((t, v) => t + (v.stock ?? 0), 0) : p.stock;
}

/** Is the product really a deal right now — marked down, and buyable? */
export function isRealDeal(p: Product): boolean {
  return (p.compareAt ?? 0) > p.price && unitsInStock(p) > 0;
}

/** Why a product in the campaign isn't being shown — for the admin. */
export function dealProblem(p: Product | undefined): string | null {
  if (!p) return "Product no longer exists";
  if (p.hidden) return "Hidden by the shop";
  if (!((p.compareAt ?? 0) > p.price)) return "No discount — shows at full price, so it's left out";
  if (unitsInStock(p) <= 0) return "Sold out";
  return null;
}

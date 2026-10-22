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

/** Product id → the flash percentage it gets right now (empty when off). */
export function flashDiscounts(flash: FlashDeal, requests: FlashRequest[], now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  if (!isFlashLive(flash, now)) return out;
  const inCampaign = new Set(flash.productIds);
  for (const r of requests) {
    if (r.status !== "approved" || !inCampaign.has(r.productId)) continue;
    out.set(r.productId, Math.max(out.get(r.productId) ?? 0, r.pct));
  }
  return out;
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

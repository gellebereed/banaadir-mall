/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHOP THE LOOK — the shared vocabulary. Safe to import from client and server.
 * ─────────────────────────────────────────────────────────────────────────
 * A look is one photo of a whole outfit with a dot on every piece, each dot
 * linked to the product it is. Shoppers tap a dot to see the piece, pick a
 * size for every piece on one sheet, and put the whole outfit in the basket
 * in one tap. Storage and the server-only reads are in lib/looks.ts.
 *
 * Two kinds:
 *   • a SHOP's look (`store` set): only that shop's products, made at
 *     /vendor/looks. It may carry a "whole look" discount, which is an
 *     ordinary bundle offer (lib/offers.ts) so the basket, the checkout and
 *     the server all price it the way they already price bundles.
 *   • a MARKETPLACE look (`store` empty): made by the admin at /admin/looks,
 *     and free to mix shops — a shirt from one, shoes from another. Only a
 *     mall can do that. No discount: an offer belongs to one shop.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { primaryImage, totalStock } from "./product-utils";
import { isPreorder } from "./preorder";
import type { Offer, Product } from "./types";

export const LOOK_OCCASIONS = [
  { key: "eid", label: "Eid", emoji: "🌙" },
  { key: "wedding", label: "Wedding", emoji: "💍" },
  { key: "office", label: "Office", emoji: "💼" },
  { key: "school", label: "School", emoji: "🎒" },
  { key: "jimce", label: "Jimce", emoji: "🕌" },
  { key: "everyday", label: "Everyday", emoji: "☀️" },
] as const;

export type LookOccasion = (typeof LOOK_OCCASIONS)[number]["key"];

export function isOccasion(value: unknown): value is LookOccasion {
  return LOOK_OCCASIONS.some((o) => o.key === value);
}

export function occasionLabel(key: LookOccasion): string {
  const o = LOOK_OCCASIONS.find((x) => x.key === key);
  return o ? `${o.emoji} ${o.label}` : key;
}

/** One dot on the photo: where it is (in % of the photo) and what it is. */
export interface LookItem {
  productId: string;
  /** 0–100, from the left edge. */
  x: number;
  /** 0–100, from the top edge. */
  y: number;
}

export interface Look {
  id: string;
  /** The shop that made it; empty for a marketplace look. */
  store?: string;
  title: string;
  description?: string;
  /** The outfit photo. */
  image: string;
  occasions: LookOccasion[];
  items: LookItem[];
  /** Shop looks only: % off when every piece is bought together. */
  discountPct?: number;
  /** The bundle offer that carries the discount (lib/offers.ts). */
  offerId?: string;
  active: boolean;
  /** Lower first in the feeds; newest first among equals. */
  position: number;
  createdAt: string;
  updatedAt?: string;
}

/** Fewest and most dots on one photo. */
export const LOOK_MIN_ITEMS = 2;
export const LOOK_MAX_ITEMS = 8;
/** A bundle offer covers at most this many products (see createOffer). */
export const LOOK_MAX_BUNDLE = 6;
export const LOOK_MAX_DISCOUNT = 50;

export const lookPath = (look: Pick<Look, "id">) => `/looks/${encodeURIComponent(look.id)}`;

/** Can this product be bought right now (or reserved, for a pre-order)? */
export function pieceAvailable(product: Product): boolean {
  return totalStock(product) > 0 || isPreorder(product);
}

/**
 * A look as the storefront shows it: its pieces resolved against today's
 * catalogue, with what is sold out and whether the discount is live.
 */
export interface LookView {
  look: Look;
  /** In dot order; pieces no longer listed (deleted, hidden shop) are left out. */
  pieces: { item: LookItem; product: Product; available: boolean }[];
  /** Pieces that cannot be bought today. */
  soldOut: number;
  /** Sum of the available pieces at today's prices. */
  total: number;
  /** The whole-look price when the shop's discount is live, else undefined. */
  bundlePrice?: number;
  /** Shop names, for "by Sahra Fashion · Bakaro Shoes". */
  storeSlugs: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve a look. Returns null when it should not be shown to shoppers:
 * switched off, or fewer than two pieces left that can actually be bought
 * — an "outfit" of one item is just a product.
 */
export function lookView(look: Look, catalogue: Map<string, Product>, offers: Offer[]): LookView | null {
  if (!look.active) return null;
  const pieces = look.items
    .map((item) => {
      const product = catalogue.get(item.productId);
      return product ? { item, product, available: pieceAvailable(product) } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const buyable = pieces.filter((p) => p.available);
  if (buyable.length < LOOK_MIN_ITEMS) return null;

  const total = round2(buyable.reduce((sum, p) => sum + p.product.price, 0));
  // The discount is what the shop's bundle offer charges — read from the
  // offer itself, so the page can never promise a price the basket won't
  // give (the shop may have paused the offer from its Promotions page).
  const offer = look.offerId ? offers.find((o) => o.id === look.offerId && o.active && !o.code) : undefined;
  const everyPiece = buyable.length === pieces.length && pieces.length === look.items.length;
  const bundlePrice =
    offer && everyPiece && offer.price !== undefined && offer.price < total ? round2(offer.price) : undefined;

  return {
    look,
    pieces,
    soldOut: pieces.length - buyable.length,
    total,
    bundlePrice,
    storeSlugs: [...new Set(pieces.map((p) => p.product.store))],
  };
}

/** What a look card needs — small enough to send to the browser in a rail. */
export interface LookCardData {
  id: string;
  title: string;
  image: string;
  occasions: LookOccasion[];
  dots: { x: number; y: number }[];
  pieces: number;
  soldOut: number;
  total: number;
  bundlePrice?: number;
  stores: string[];
  thumbs: { image?: string; icon: string; name: string }[];
}

export function lookCard(view: LookView, storeNames: Map<string, string>): LookCardData {
  return {
    id: view.look.id,
    title: view.look.title,
    image: view.look.image,
    occasions: view.look.occasions,
    dots: view.pieces.map((p) => ({ x: p.item.x, y: p.item.y })),
    pieces: view.pieces.length,
    soldOut: view.soldOut,
    total: view.total,
    bundlePrice: view.bundlePrice,
    stores: view.storeSlugs.map((s) => storeNames.get(s) ?? s.replace(/-/g, " ")),
    thumbs: view.pieces.slice(0, 4).map((p) => ({ image: primaryImage(p.product), icon: p.product.icon, name: p.product.name })),
  };
}

/** Feed order: the admin's/shop's position, then newest. */
export function sortLooks<T extends Pick<Look, "position" | "createdAt">>(looks: T[]): T[] {
  return [...looks].sort((a, b) => a.position - b.position || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Looks this basket completes: every piece of the look is in it. Used for
 * the Rewards bonus at checkout (app/actions.ts → submitOrderAction).
 */
export function completedLooks(looks: Look[], basketProductIds: Iterable<string>): Look[] {
  const inBasket = new Set(basketProductIds);
  return looks.filter(
    (look) => look.active && look.items.length >= LOOK_MIN_ITEMS && look.items.every((i) => inBasket.has(i.productId)),
  );
}

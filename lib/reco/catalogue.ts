/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SHELF CATALOGUE — what the admin panel lists.
 * ─────────────────────────────────────────────────────────────────────────
 * A plain, client-safe description of every shelf the engine can build, so
 * /admin/discovery can list them without importing the engine itself (which
 * pulls in the whole data layer and would not survive being sent to a
 * browser).
 *
 * These ids MUST match the shelf ids in lib/reco/shelves.ts — they are the
 * key the admin's visibility, title and slot overrides are stored against.
 * A drifting id does not error; it silently stops applying, which is worse.
 * If you add a shelf there, add it here.
 */

import type { ShelfSlot } from "../types";
import type { Surface } from "./types";

export interface ShelfInfo {
  id: string;
  /** The engine's own title, shown as the placeholder for an override. */
  title: string;
  surface: Surface;
  /** Where it sits by default on the home page. */
  slot: ShelfSlot;
  /** One line for the admin: what actually decides its contents. */
  blurb: string;
  /** False for the shelves that must never carry a merchandised push. */
  pinnable: boolean;
}

export const SHELF_CATALOGUE: ShelfInfo[] = [
  // ── Home ──────────────────────────────────────────────────────────
  {
    id: "continue",
    title: "Pick up where you left off",
    surface: "home",
    slot: "top",
    blurb: "Products this shopper opened and hasn't bought. Their own history — nothing else feeds it.",
    pinnable: false,
  },
  {
    id: "price-drops",
    title: "Cheaper than when you looked",
    surface: "home",
    slot: "early",
    blurb: "Saved or viewed products with a live seller promotion on them right now.",
    pinnable: true,
  },
  {
    id: "for-you",
    title: "Chosen for you",
    surface: "home",
    slot: "early",
    blurb: "The main personalised grid. Hidden entirely until the engine knows enough to mean it.",
    pinnable: true,
  },
  {
    id: "basket",
    title: "Finish what you started",
    surface: "home",
    slot: "early",
    blurb: "Cross-department products bought alongside what's in their basket. Only shows with a basket.",
    pinnable: true,
  },
  {
    id: "rising",
    title: "Moving fast this week",
    surface: "home",
    slot: "mid",
    blurb: "Ranked by acceleration in real orders, not all-time sales. Changes on its own.",
    pinnable: true,
  },
  {
    id: "saved-like",
    title: "More like the things you saved",
    surface: "home",
    slot: "mid",
    blurb: "Matched against specific wishlist items. Only shows for shoppers with a wishlist.",
    pinnable: true,
  },
  {
    id: "new-from-stores",
    title: "Just landed at <their favourite shop>",
    surface: "home",
    slot: "mid",
    blurb: "New listings from the shops this shopper returns to most.",
    pinnable: true,
  },
  {
    id: "loved",
    title: "Loved across the mall",
    surface: "home",
    slot: "mid",
    blurb: "The cold-start shelf: review-weighted ratings, shown to shoppers we don't know yet.",
    pinnable: true,
  },
  {
    id: "discover",
    title: "Worth a look",
    surface: "home",
    slot: "late",
    blurb: "Deliberately outside their usual departments. Kept unmerchandised on purpose.",
    pinnable: false,
  },

  // ── Product page ──────────────────────────────────────────────────
  {
    id: "completes",
    title: "Complete the look / room",
    surface: "product",
    slot: "mid",
    blurb: "Cross-department products real orders paired with this one.",
    pinnable: true,
  },
  {
    id: "also-like",
    title: "You may also like",
    surface: "product",
    slot: "mid",
    blurb: "Alternatives to the product being viewed, matched on department, brand and materials.",
    pinnable: true,
  },
  {
    id: "seed-store",
    title: "More from <this shop>",
    surface: "product",
    slot: "late",
    blurb: "The rest of this seller's range, closest matches first.",
    pinnable: true,
  },
  {
    id: "for-you-pdp",
    title: "Because of what you've been browsing",
    surface: "product",
    slot: "late",
    blurb: "Their own history rather than this product. Needs enough behaviour to be honest.",
    pinnable: true,
  },

  // ── Cart ──────────────────────────────────────────────────────────
  {
    id: "basket-completes",
    title: "Goes with what's in your basket",
    surface: "cart",
    slot: "mid",
    blurb: "The highest-value shelf on the site. Co-purchase evidence only.",
    pinnable: true,
  },
  {
    id: "cart-saved",
    title: "Still on your wishlist",
    surface: "cart",
    slot: "late",
    blurb: "Saved items, framed as shipping together in one delivery.",
    pinnable: true,
  },

  // ── Wishlist ──────────────────────────────────────────────────────
  {
    id: "wishlist-drops",
    title: "Price dropped on your saved items",
    surface: "wishlist",
    slot: "top",
    blurb: "Live promotions on things they already told us they want.",
    pinnable: true,
  },
  {
    id: "wishlist-like",
    title: "More like what you saved",
    surface: "wishlist",
    slot: "mid",
    blurb: "Each card names the specific saved product it was matched to.",
    pinnable: true,
  },
  {
    id: "wishlist-completes",
    title: "Would go with them",
    surface: "wishlist",
    slot: "late",
    blurb: "Co-purchase partners for the wishlist rather than the basket.",
    pinnable: true,
  },

  // ── Order confirmation ────────────────────────────────────────────
  {
    id: "order-completes",
    title: "Goes with what you just ordered",
    surface: "confirmation",
    slot: "mid",
    blurb: "Add-ons that can still travel in the same parcel. The peak-end moment.",
    pinnable: true,
  },
  {
    id: "order-next",
    title: "For next time",
    surface: "confirmation",
    slot: "late",
    blurb: "Their browsing history, kept for the next visit.",
    pinnable: true,
  },
];

export const SURFACE_LABEL: Record<Surface, string> = {
  home: "Home page",
  product: "Product page",
  cart: "Cart",
  wishlist: "Wishlist",
  confirmation: "Order confirmation",
};

export const SLOT_LABEL: Record<ShelfSlot, string> = {
  top: "Top — under the hero",
  early: "Early — after the departments",
  mid: "Middle — between the mall's own rails",
  late: "Bottom — the closing row",
};

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  RECOMMENDATIONS — the shared vocabulary.
 * ─────────────────────────────────────────────────────────────────────────
 * Everything the recommender produces is *explained*. A `Recommendation` is
 * never just a product id and a score: it carries the reason it surfaced and
 * the real evidence behind it, because the whole design rests on one bet —
 *
 *   a shopper trusts a suggestion they can audit, and buys from the ones
 *   they trust.
 *
 * That is also the rule everything here is held to: no invented urgency, no
 * fake countdowns, no "3 people are looking at this right now". Scarcity is
 * only shown when stock is genuinely low, momentum only when orders really
 * moved, savings only when a promotion is really live. A nudge that turns
 * out to be untrue costs more than the sale it won.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product, PromptSettings, ShelfSlot } from "../types";

/** Where a set of recommendations is being rendered. */
export type Surface = "home" | "product" | "cart" | "wishlist" | "confirmation";

/**
 * A thing the shopper did. Recorded in the browser only (see
 * lib/reco/profile.ts) — nothing is written to a server-side profile table,
 * so a shopper who clears their browser really has cleared their history.
 */
export type EventKind =
  | "view" // opened a product page
  | "dwell" // stayed on it — seconds in `s`
  | "option" // chose a colour / size, i.e. was seriously considering it
  | "wish" // saved it
  | "unwish"
  | "cart" // put it in the basket
  | "uncart"
  | "buy" // completed checkout with it
  | "search" // typed a query — text in `q`
  | "mute"; // said "not interested"

export interface TasteEvent {
  /** Product id. Absent for `search`. */
  id?: string;
  k: EventKind;
  /** Epoch milliseconds. */
  at: number;
  /** Dwell seconds, for `dwell`. */
  s?: number;
  /** Search text, for `search`. */
  q?: string;
}

/** The whole of what we know about a shopper, kept in their own browser. */
export interface TasteProfile {
  /** Schema version — bumping it discards an incompatible stored profile. */
  v: number;
  updatedAt: number;
  /** Newest last. Capped; see PROFILE_EVENT_CAP. */
  events: TasteEvent[];
  /** Product ids the shopper explicitly rejected. Permanent until undone. */
  muted: string[];
  /** Answers the shopper gave us directly. See ShopperPreferences. */
  prefs?: ShopperPreferences;
}

/**
 * What the shopper TOLD us, as opposed to what we inferred.
 *
 * Stated preferences are worth a great deal on a first visit, when there is
 * no behaviour to learn from — the difference between a useful home page
 * and a generic one is often a single answer to "what are you shopping
 * for?". They are deliberately weighted to fade as real behaviour arrives:
 * what somebody does beats what they said they would do.
 *
 * Note there is no gender field. Asking for one is a worse version of the
 * question actually worth asking — a man buying a gift wants womenswear,
 * and a shopper's departments change with the occasion. Departments are
 * more accurate, more useful, and less intrusive.
 */
export interface ShopperPreferences {
  /** Category slugs they said they shop. */
  departments?: string[];
  /** Comfortable spend band key — see PRICE_BANDS in prompts.ts. */
  budget?: string;
  /** When the shopper answered, so the weight can decay. */
  answeredAt?: number;
  /**
   * Prompt id → epoch ms it was last shown. Drives the cooldown, and is the
   * reason a dismissed prompt does not come straight back on the next page.
   */
  promptsSeen?: Record<string, number>;
  /** Prompt ids the shopper answered — never asked again. */
  promptsDone?: string[];
  /** Product ids already rated, so the review prompt doesn't repeat. */
  rated?: string[];
}

/** A prompt the server has decided is worth showing this shopper. */
export interface PromptOffer {
  id: string;
  kind: "departments" | "budget" | "review";
  title: string;
  body?: string;
  /** For `review`: the product being asked about. */
  product?: Product;
  orderId?: string;
  /** Choices, for the two preference prompts. */
  options?: { value: string; label: string; icon?: string }[];
  /** Seconds to wait before showing it. Comes from the admin's settings. */
  delaySeconds: number;
}

// ── Reasons ────────────────────────────────────────────────────────────

export type ReasonKind =
  | "viewed"
  | "saved"
  | "in-cart"
  | "bought-together"
  | "similar"
  | "completes"
  | "store"
  | "brand"
  | "rising"
  | "price-fit"
  | "new"
  | "popular"
  | "discover"
  | "price-drop";

/**
 * Why this product is in front of you, in words a shopper can check.
 * `anchorName` is the thing it hangs off — the product you looked at, the
 * store you keep coming back to — and it is what makes the sentence land.
 */
export interface Reason {
  kind: ReasonKind;
  text: string;
  anchorId?: string;
  anchorName?: string;
}

/**
 * Evidence, all of it derived from real records. Every field here is
 * optional precisely because it is omitted rather than invented when the
 * data does not support it.
 */
export interface SocialProof {
  /** "14 bought this week" — counted from actual orders. */
  momentum?: string;
  /** "Only 3 left" — shown at or below LOW_STOCK_VISIBLE units. */
  scarcity?: string;
  /** "★ 4.8 · 240 reviews" */
  rating?: string;
  /** "35% off" — only when a promotion or campaign is genuinely applied. */
  savings?: string;
}

export interface Recommendation {
  product: Product;
  score: number;
  reason: Reason;
  /**
   * How many independent strategies surfaced this product. Two unrelated
   * routes arriving at the same item is the strongest signal the engine
   * has, and it is worth more than either route's own score.
   */
  agreement: number;
  proof?: SocialProof;
  /**
   * True when the slot was deliberately spent on something outside the
   * shopper's established taste. Roughly one in six slots is reserved this
   * way — a recommender that only ever confirms what it already believes
   * stops being useful within a week (see engine.ts, EXPLORE_RATE).
   */
  exploratory?: boolean;
}

// ── Shelves ────────────────────────────────────────────────────────────

/** Visual register. Personal shelves are warm; discovery shelves are calm. */
export type ShelfTone = "personal" | "social" | "utility" | "discovery";

export interface Shelf {
  id: string;
  title: string;
  subtitle?: string;
  /**
   * The two-word kicker above the title, e.g. "Price watch".
   *
   * Set per shelf rather than derived from the tone: a price-drop row and a
   * "goes with this" row can share a visual treatment while describing
   * completely different things, and labelling both "Goes together" is the
   * kind of small wrongness that makes a whole page feel machine-made.
   */
  eyebrow: string;
  tone: ShelfTone;
  glyph: string;
  items: Recommendation[];
  href?: string;
  layout: "rail" | "grid";
  /**
   * Where on the home page this shelf belongs. The page renders each slot
   * at a different point so the personalised rows are interleaved with the
   * marketplace's own sections rather than stacked into one block.
   */
  slot: ShelfSlot;
  /** Rendered on a tinted full-bleed band instead of the page background. */
  feature?: boolean;
  /**
   * The transparency line, shown behind the "Why these?" control. Explains
   * how the shelf itself was assembled, not just each card.
   */
  why: string;
}

// ── Bundles ────────────────────────────────────────────────────────────

/** "Frequently bought together" — the seed plus its strongest partners. */
export interface Bundle {
  seed: Product;
  partners: { product: Product; coOrders: number }[];
  /** What the whole set costs at today's prices. */
  total: number;
  /** Real saving against compare-at prices; 0 when nothing is discounted. */
  saving: number;
  /** Plain-words provenance, e.g. "Based on 23 orders that included this". */
  basis: string;
}

// ── Request / response ─────────────────────────────────────────────────

export interface CartLineRef {
  productId: string;
  qty: number;
}

export interface RecoRequest {
  surface: Surface;
  profile: TasteProfile;
  /** Product being viewed, for the product surface. */
  seedId?: string;
  /** What is in the basket right now — drives "completes your basket". */
  cart?: CartLineRef[];
  /**
   * The wishlist as it stands, sent as STATE rather than reconstructed
   * from `wish`/`unwish` events.
   *
   * Events are a history and can be incomplete: a shopper who saved things
   * before this feature existed, or on another tab, has a wishlist the
   * event log knows nothing about. Their saved items are the clearest
   * statement of intent the engine gets — rebuilding that from a log and
   * quietly missing half of it is not a trade worth making when the client
   * is holding the authoritative list anyway.
   */
  wishlist?: string[];
  /**
   * Products the page is already showing outside the recommender — the
   * admin's own Trending / Just Landed / flash rails.
   *
   * The shelves de-duplicate against each other, but they cannot see the
   * server-rendered sections above them, and a shopper does not experience
   * "the marketplace curated this" and "the engine picked this" as two
   * different things. They see the same eight products twice and conclude
   * the shop is small.
   */
  excludeIds?: string[];
  /** Basket subtotal, for the free-delivery goal meter. */
  subtotal?: number;
}

export interface RecoResponse {
  shelves: Shelf[];
  bundle?: Bundle;
  /** A question worth asking this shopper right now, if there is one. */
  prompt?: PromptOffer;
  /** The admin's prompt configuration, so the client can pace itself. */
  promptSettings?: PromptSettings;
  /** Free-delivery progress, when the admin has a threshold configured. */
  goal?: DeliveryGoal;
  /** Shopper's first name when signed in — used to address shelves. */
  firstName?: string;
  /** City inferred from the shopper's own past orders, never from IP. */
  city?: string;
  /**
   * 0–1. How much the engine actually knows. Drives which shelves appear:
   * a first-time visitor gets discovery and momentum, a returning one gets
   * their own history back.
   */
  confidence: number;
}

/**
 * The goal-gradient module: people accelerate toward a goal the closer they
 * get to it, which is only a decent thing to exploit when the goal is real.
 * `remaining` comes from the admin's own free-delivery threshold, and
 * `closers` are products that genuinely close the gap.
 */
export interface DeliveryGoal {
  threshold: number;
  subtotal: number;
  remaining: number;
  /** 0–1, for the progress bar. */
  progress: number;
  reached: boolean;
  fee: number;
  /** Cheapest good things that would tip the basket over the line. */
  closers: Product[];
}

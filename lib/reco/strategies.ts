/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STRATEGIES — the independent ways a product can earn a slot.
 * ─────────────────────────────────────────────────────────────────────────
 * Each strategy answers one question, knows nothing about the others, and
 * returns candidates with the reason already written. The blender
 * (lib/reco/engine.ts) merges them.
 *
 * Keeping them separate is what makes the system honest and debuggable: a
 * card that says "bought together with your kettle — 23 orders" came from
 * exactly one function, against exactly one piece of evidence, and you can
 * go and read it. It is also what makes AGREEMENT possible — when two
 * strategies that share no inputs both nominate the same product, that
 * concurrence is worth more than either score, and the blender can only
 * notice it because they ran independently.
 *
 * Scores here are internally consistent but NOT comparable across
 * strategies; the blender normalises each strategy's output before mixing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Category, Product, Store } from "../types";
import { totalStock } from "../product-utils";
import type { AffinityGraph } from "./affinity";
import { partnersOf, partnersOfSet } from "./affinity";
import type { MomentumIndex } from "./momentum";
import { risingProducts } from "./momentum";
import type { SimilarityIndex } from "./similarity";
import { nearestTo, similarity } from "./similarity";
import type { Taste } from "./taste";
import { tasteScore, topKeys } from "./taste";
import type { Reason } from "./types";

/** An admin push, resolved and already checked against its date window. */
export interface ActivePin {
  productId: string;
  /** Shelf id to force it into, or "auto". */
  shelf: string;
  note?: string;
}

export interface RecoContext {
  products: Product[];
  byId: Map<string, Product>;
  stores: Map<string, Store>;
  categories: Map<string, Category>;
  taste: Taste;
  index: SimilarityIndex;
  graph: AffinityGraph;
  momentum: MomentumIndex;
  /** The product being viewed, on the product surface. */
  seed?: Product;
  /** Product ids in the basket right now. */
  cartIds: string[];
  /** Live admin pushes — see the adminPins strategy. */
  pins: ActivePin[];
  /** The shelf currently being blended, so pins can target one. */
  shelfId?: string;
  now: number;
}

export interface Candidate {
  id: string;
  score: number;
  reason: Reason;
}

export interface Strategy {
  key: string;
  run: (ctx: RecoContext) => Candidate[];
}

/** How deep any one strategy is allowed to go before the blender sees it. */
const DEPTH = 40;

function categoryName(ctx: RecoContext, slug: string | undefined): string {
  if (!slug) return "this range";
  return ctx.categories.get(slug)?.name ?? slug.replace(/-/g, " ");
}

function storeName(ctx: RecoContext, slug: string | undefined): string {
  if (!slug) return "this store";
  return ctx.stores.get(slug)?.name ?? slug.replace(/-/g, " ");
}

// ── Seeded by the product being viewed ─────────────────────────────────

/** People who bought this also bought — the marketplace's own receipts. */
export const boughtTogether: Strategy = {
  key: "bought-together",
  run: (ctx) => {
    if (!ctx.seed) return [];
    return partnersOf(ctx.graph, ctx.seed.id, { limit: DEPTH }).map((edge) => ({
      id: edge.id,
      score: edge.score,
      reason: {
        kind: "bought-together" as const,
        text: `Bought together with ${ctx.seed!.name} in ${edge.coOrders} order${edge.coOrders === 1 ? "" : "s"}`,
        anchorId: ctx.seed!.id,
        anchorName: ctx.seed!.name,
      },
    }));
  },
};

/**
 * Alternatives to what you are looking at. Restricted to the same category
 * branch, because "similar" to a shopper comparing options means another
 * one of the same thing — not something that merely shares a colour.
 */
/** Enough near-neighbours in the seed's own department to stop looking. */
const SIMILAR_ENOUGH = 8;

export const similarToSeed: Strategy = {
  key: "similar",
  run: (ctx) => {
    const seed = ctx.seed;
    if (!seed) return [];

    const reason = {
      kind: "similar" as const,
      text: `Similar to ${seed.name}`,
      anchorId: seed.id,
      anchorName: seed.name,
    };

    const inDepartment = nearestTo(
      seed.id,
      ctx.index,
      ctx.index.byCategory.get(seed.category) ?? [],
      DEPTH,
      0.05,
    );

    /**
     * Widen to the whole catalogue when the seed's own department cannot
     * fill the shelf.
     *
     * Judging that on the SIZE of the department, as this used to, gets it
     * backwards: a department can hold thirty products and still contain
     * only two that resemble the one being viewed. What matters is how many
     * near-neighbours were actually found — and if the answer is two, "you
     * may also like" disappears from the page entirely, which is how a
     * product page ends up with no alternatives on it at all.
     */
    if (inDepartment.length >= SIMILAR_ENOUGH) {
      return inDepartment.map((hit) => ({ id: hit.id, score: hit.score, reason }));
    }

    const seen = new Set(inDepartment.map((hit) => hit.id));
    const wider = nearestTo(
      seed.id,
      ctx.index,
      ctx.products.map((product) => product.id),
      DEPTH,
      0.03,
    ).filter((hit) => !seen.has(hit.id));

    return [
      // Same-department matches keep the lead — a shopper comparing options
      // wants another one of the same kind of thing first.
      ...inDepartment.map((hit) => ({ id: hit.id, score: hit.score + 0.1, reason })),
      ...wider.map((hit) => ({ id: hit.id, score: hit.score, reason })),
    ].slice(0, DEPTH);
  },
};

/**
 * What goes WITH it rather than instead of it. Complement edges first,
 * topped up with cross-category content matches so the shelf still says
 * something sensible for a product nobody has bought yet.
 */
export const completesSeed: Strategy = {
  key: "completes",
  run: (ctx) => {
    if (!ctx.seed) return [];
    const seed = ctx.seed;

    const fromOrders = partnersOf(ctx.graph, seed.id, {
      complementsOnly: true,
      limit: DEPTH,
    }).map((edge) => ({
      id: edge.id,
      score: edge.score * 1.4,
      reason: {
        kind: "completes" as const,
        text: `Goes with ${seed.name} — ${edge.coOrders} shopper${edge.coOrders === 1 ? "" : "s"} bought both`,
        anchorId: seed.id,
        anchorName: seed.name,
      },
    }));

    if (fromOrders.length >= 6) return fromOrders;

    /**
     * No purchase evidence yet — which is the normal case for a young
     * marketplace and for every product listed this week. Two weaker but
     * still defensible signals stand in, and the reason text says which
     * one is being used rather than dressing either up as a co-purchase:
     *
     *   SAME SHOP, DIFFERENT DEPARTMENT. Sellers curate coherent ranges;
     *   the shop selling the coffee maker is the one selling the mugs.
     *   The claim on the card is only that they share a seller, which is
     *   a fact the shopper can check by tapping through.
     *
     *   SHARED MATERIALS AND STYLE. Cross-category content similarity —
     *   the same brand, season, fabric or design language.
     */
    const seedVector = ctx.index.vectors.get(seed.id);
    const contextual: Candidate[] = [];

    for (const product of ctx.products) {
      if (product.category === seed.category) continue;

      const content = similarity(seedVector, ctx.index.vectors.get(product.id));
      const sameStore = product.store === seed.store;
      if (!sameStore && content < 0.06) continue;

      contextual.push({
        id: product.id,
        score: content + (sameStore ? 0.12 : 0),
        reason: sameStore
          ? {
              kind: "store" as const,
              text: `${storeName(ctx, seed.store)} sells this alongside ${seed.name}`,
              anchorId: seed.id,
              anchorName: seed.name,
            }
          : {
              kind: "completes" as const,
              text: `Matches ${seed.name} on brand and materials`,
              anchorId: seed.id,
              anchorName: seed.name,
            },
      });
    }

    contextual.sort((a, b) => b.score - a.score);
    return [...fromOrders, ...contextual.slice(0, DEPTH)];
  },
};

export const moreFromSeedStore: Strategy = {
  key: "seed-store",
  run: (ctx) => {
    if (!ctx.seed) return [];
    const seed = ctx.seed;
    const label = storeName(ctx, seed.store);
    return (ctx.index.byStore.get(seed.store) ?? [])
      .filter((id) => id !== seed.id)
      .map((id) => ({
        id,
        score: similarity(ctx.index.vectors.get(seed.id), ctx.index.vectors.get(id)) + 0.05,
        reason: {
          kind: "store" as const,
          text: `More from ${label}`,
          anchorId: seed.id,
          anchorName: label,
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, DEPTH);
  },
};

// ── Seeded by who the shopper is ───────────────────────────────────────

/** The core personalised shelf: everything scored against the taste vector. */
export const fromTaste: Strategy = {
  key: "taste",
  run: (ctx) => {
    if (ctx.taste.confidence < 0.15) return [];

    const topCategory = topKeys(ctx.taste.categories, 1)[0];
    const topStore = topKeys(ctx.taste.stores, 1)[0];

    const scored: Candidate[] = [];
    for (const product of ctx.products) {
      // Something already seen is not a discovery; the "continue browsing"
      // shelf is where those belong.
      if (ctx.taste.touched.has(product.id)) continue;
      const score = tasteScore(product, ctx.taste);
      if (score < 0.12) continue;

      scored.push({
        id: product.id,
        score,
        reason: reasonForTaste(ctx, product, topCategory, topStore),
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, DEPTH * 2);
  },
};

/**
 * The reason sentence has to name the *specific* thing that earned the
 * slot. "Recommended for you" is not a reason — it is the absence of one,
 * and shoppers read it as such.
 */
function reasonForTaste(
  ctx: RecoContext,
  product: Product,
  topCategory: string | undefined,
  topStore: string | undefined,
): Reason {
  if (product.store === topStore) {
    return { kind: "store", text: `You keep coming back to ${storeName(ctx, product.store)}` };
  }
  if (product.subcategory && ctx.taste.subcategories.has(product.subcategory)) {
    return { kind: "similar", text: `Matches the ${product.subcategory} you've been looking at` };
  }
  if (product.category === topCategory) {
    return { kind: "similar", text: `From ${categoryName(ctx, product.category)} — the department you browse most` };
  }
  const anchor = ctx.taste.viewedRecent
    .map((id) => ctx.byId.get(id))
    .find((seen) => seen && seen.category === product.category);
  if (anchor) {
    return {
      kind: "viewed",
      text: `Because you looked at ${anchor.name}`,
      anchorId: anchor.id,
      anchorName: anchor.name,
    };
  }
  return { kind: "similar", text: `Fits what you've been browsing` };
}

/**
 * The Zeigarnik shelf: things opened and left unfinished.
 *
 * An interrupted task stays mentally "open" — which is why the single most
 * effective thing a shop can show a returning customer is the item they
 * were looking at when they got interrupted, not a new suggestion. Anything
 * already basketed or bought is dropped: the loop is closed, and re-showing
 * it is just clutter.
 */
export const continueBrowsing: Strategy = {
  key: "continue",
  run: (ctx) => {
    const candidates: Candidate[] = [];
    ctx.taste.viewedRecent.forEach((id, position) => {
      if (ctx.taste.bought.has(id) || ctx.taste.carted.has(id)) return;
      if (ctx.cartIds.includes(id)) return;
      if (ctx.seed?.id === id) return;
      const product = ctx.byId.get(id);
      if (!product) return;
      candidates.push({
        id,
        // Recency ordering, gently flattened so position 6 is still viable.
        score: 1 / (1 + position * 0.35),
        reason: {
          kind: "viewed",
          text: ctx.taste.wished.has(id) ? "Saved and still waiting" : "You were looking at this",
        },
      });
    });
    return candidates.slice(0, 16);
  },
};

/** Built out from the wishlist — the clearest statement of intent we have. */
export const becauseYouSaved: Strategy = {
  key: "saved",
  run: (ctx) => {
    const saved = [...ctx.taste.wished].filter((id) => ctx.byId.has(id));
    if (saved.length === 0) return [];

    const merged = new Map<string, Candidate>();
    for (const savedId of saved.slice(0, 6)) {
      const anchor = ctx.byId.get(savedId)!;
      const pool = ctx.index.byCategory.get(anchor.category) ?? [];
      const candidates = pool.length >= 8 ? pool : ctx.products.map((p) => p.id);
      for (const hit of nearestTo(savedId, ctx.index, candidates, 12, 0.12)) {
        if (ctx.taste.wished.has(hit.id)) continue;
        const existing = merged.get(hit.id);
        if (existing) {
          existing.score += hit.score;
          continue;
        }
        merged.set(hit.id, {
          id: hit.id,
          score: hit.score,
          reason: {
            kind: "saved",
            text: `Like ${anchor.name}, which you saved`,
            anchorId: anchor.id,
            anchorName: anchor.name,
          },
        });
      }
    }

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, DEPTH);
  },
};

/**
 * Complements for what is in the basket — the Diderot shelf.
 *
 * Buying one thing creates a felt gap around it: new curtains make the rug
 * look wrong. This is the most commercially valuable shelf on the site and
 * also the most easily abused, so it is held to complements with real
 * co-purchase evidence rather than anything the ranker merely likes.
 */
/**
 * Shared by the basket and wishlist versions below.
 *
 * `possessive` is how the card refers back to the anchor — "your kettle"
 * when it is in the basket, "the kettle you saved" when it is on the
 * wishlist. Getting that wrong is small but corrosive: a shelf on the
 * wishlist page explaining itself in terms of the shopper's basket makes
 * the whole system look like it is guessing.
 */
function coPurchaseCandidates(
  ctx: RecoContext,
  seeds: string[],
  possessive: (name: string) => { completes: string; together: string },
): Candidate[] {
  if (seeds.length === 0) return [];

  const toCandidate = (
    partner: { id: string; score: number; from: string[] },
    complement: boolean,
  ): Candidate => {
    const anchor = ctx.byId.get(partner.from[0]);
    const copy = anchor ? possessive(anchor.name) : undefined;
    return {
      id: partner.id,
      // Same-department partners are real co-purchases but weaker
      // suggestions — you are less likely to want a second one of
      // something you are already buying.
      score: complement ? partner.score : partner.score * 0.55,
      reason: {
        kind: complement ? ("completes" as const) : ("bought-together" as const),
        text: copy
          ? complement
            ? copy.completes
            : copy.together
          : "Goes with what you're buying",
        anchorId: anchor?.id,
        anchorName: anchor?.name,
      },
    };
  };

  const complements = partnersOfSet(ctx.graph, seeds, { complementsOnly: true });
  const complementIds = new Set(complements.map((partner) => partner.id));

  /**
   * Cross-department pairings are the ones worth having, so they come
   * first — but insisting on them exclusively is how this shelf goes silent
   * on a marketplace whose departments are coarse. A pair of shoes and a
   * suit sit in the same department here, so the strongest real co-purchase
   * in the order book was being discarded for a taxonomy reason the shopper
   * cannot see.
   *
   * The rest are topped up underneath, with copy that says what they
   * actually are: bought together, not "completes".
   */
  const sameDepartment = partnersOfSet(ctx.graph, seeds).filter(
    (partner) => !complementIds.has(partner.id),
  );

  return [
    ...complements.map((partner) => toCandidate(partner, true)),
    ...sameDepartment.map((partner) => toCandidate(partner, false)),
  ].slice(0, DEPTH);
}

export const completesBasket: Strategy = {
  key: "basket",
  run: (ctx) =>
    coPurchaseCandidates(
      ctx,
      [...new Set([...ctx.cartIds, ...ctx.taste.carted])].filter((id) => ctx.byId.has(id)),
      (name) => ({
        completes: `Completes your ${name}`,
        together: `Bought together with your ${name}`,
      }),
    ),
};

/** The same idea seeded from the wishlist, for the saved-items page. */
export const completesSaved: Strategy = {
  key: "saved-basket",
  run: (ctx) =>
    coPurchaseCandidates(
      ctx,
      [...ctx.taste.wished].filter((id) => ctx.byId.has(id)),
      (name) => ({
        completes: `Goes with the ${name} you saved`,
        together: `Bought together with the ${name} you saved`,
      }),
    ),
};

/**
 * A saved or viewed product whose price has actually come down.
 *
 * Loss aversion makes a price drop on something you already wanted far more
 * motivating than a discount on something you didn't — and unlike most
 * urgency devices, this one is simply true: the promotion is live, and the
 * shopper had already declared interest.
 */
export const priceDrops: Strategy = {
  key: "price-drop",
  run: (ctx) => {
    const watched = new Set([...ctx.taste.wished, ...ctx.taste.viewedRecent.slice(0, 20)]);
    const candidates: Candidate[] = [];
    for (const id of watched) {
      const product = ctx.byId.get(id);
      if (!product?.compareAt || product.compareAt <= product.price) continue;
      if (ctx.taste.bought.has(id)) continue;
      const off = Math.round((1 - product.price / product.compareAt) * 100);
      if (off < 5) continue;
      candidates.push({
        id,
        // A save is a stronger prior claim than a glance.
        score: (off / 100) * (ctx.taste.wished.has(id) ? 1.6 : 1),
        reason: {
          kind: "price-drop",
          text: ctx.taste.wished.has(id)
            ? `${off}% off something you saved`
            : `${off}% off since you looked`,
        },
      });
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, DEPTH);
  },
};

export const newFromYourStores: Strategy = {
  key: "new-from-stores",
  run: (ctx) => {
    const favourites = topKeys(ctx.taste.stores, 4);
    if (favourites.length === 0) return [];

    const candidates: Candidate[] = [];
    favourites.forEach((slug, rank) => {
      const label = storeName(ctx, slug);
      for (const id of ctx.index.byStore.get(slug) ?? []) {
        const product = ctx.byId.get(id);
        if (!product || ctx.taste.touched.has(id)) continue;
        if (product.badge !== "New") continue;
        candidates.push({
          id,
          score: 1 / (1 + rank),
          reason: { kind: "new", text: `Just landed at ${label}`, anchorName: label },
        });
      }
    });
    return candidates.slice(0, DEPTH);
  },
};

// ── Seeded by the marketplace ──────────────────────────────────────────

/** Real acceleration, not a static bestseller list. See momentum.ts. */
export const rising: Strategy = {
  key: "rising",
  run: (ctx) => {
    if (!ctx.momentum.meaningful) return [];
    const where = ctx.momentum.city ? ` in ${ctx.momentum.city}` : "";

    return risingProducts(ctx.momentum, DEPTH).map((hit) => ({
      id: hit.id,
      score: hit.rising,
      reason: {
        kind: "rising" as const,
        // The real figures, not a re-wording of the shelf title above it.
        // "8 sold this week, up from 2" is checkable; "selling fast" is not.
        text:
          hit.previousUnits > 0
            ? `${hit.units} sold${where} this week, up from ${hit.previousUnits}`
            : `${hit.units} sold${where} this week — none the week before`,
      },
    }));
  },
};

/**
 * The cold-start floor. Ranked by a Bayesian-shrunk rating rather than raw
 * stars, so a single five-star review cannot outrank a 4.6 with 300 — that
 * mistake is what makes a "top rated" shelf full of products nobody has
 * heard of.
 */
export const popular: Strategy = {
  key: "popular",
  run: (ctx) => {
    const meanRating =
      ctx.products.reduce((total, p) => total + p.rating, 0) / Math.max(1, ctx.products.length);
    const PRIOR_REVIEWS = 25;

    return ctx.products
      .map((product) => {
        const shrunk =
          (product.rating * product.reviewCount + meanRating * PRIOR_REVIEWS) /
          (product.reviewCount + PRIOR_REVIEWS);
        return {
          id: product.id,
          score: shrunk * Math.log10(10 + product.sold),
          reason: {
            kind: "popular" as const,
            text:
              product.reviewCount > 40
                ? `★ ${product.rating.toFixed(1)} from ${product.reviewCount.toLocaleString()} reviews`
                : "One of the mall's most bought",
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, DEPTH);
  },
};

/**
 * Deliberate serendipity.
 *
 * Products in departments the shopper has NOT been living in, chosen for
 * quality rather than fit. A recommender that only ever narrows will, given
 * a few weeks, show a customer the same shelf forever — they stop looking,
 * and the marketplace loses the discovery that made them browse in the
 * first place. This is the arm that keeps the catalogue open, and the
 * engine reserves slots for it on purpose (engine.ts, EXPLORE_RATE).
 */
export const discover: Strategy = {
  key: "discover",
  run: (ctx) => {
    const familiar = new Set(topKeys(ctx.taste.categories, 3));
    return ctx.products
      .filter((product) => !familiar.has(product.category) && !ctx.taste.touched.has(product.id))
      .filter((product) => product.rating >= 4.3 && totalStock(product) > 0)
      .map((product) => ({
        id: product.id,
        // Under-exposed but well-reviewed: the honest definition of a find.
        score: product.rating / Math.log10(20 + product.sold),
        reason: {
          kind: "discover" as const,
          text: `Something different — ${categoryName(ctx, product.category)}, rated ${product.rating.toFixed(1)}`,
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, DEPTH);
  },
};

/**
 * Products the admin is pushing (/admin/discovery).
 *
 * A merchandiser has to be able to put something in front of shoppers —
 * a new franchise launching, stock that has to move before a season turns,
 * a supplier commitment. Pretending an algorithm should own that decision
 * outright is how recommender projects end up quietly disabled.
 *
 * But the push goes in as an OPINION, not an override. A pinned product
 * still has to clear the stock check, still loses to a shopper's explicit
 * "not interested", and still competes under the diversity caps. The admin
 * sets how loudly it argues (pinStrength), not whether the shelf listens.
 *
 * Pins targeted at a specific shelf are silent everywhere else, so a push
 * meant for "Chosen for you" does not turn up under "Bought together".
 */
export const adminPins: Strategy = {
  key: "pins",
  run: (ctx) => {
    if (ctx.pins.length === 0) return [];

    const candidates: Candidate[] = [];
    ctx.pins.forEach((pin, index) => {
      if (pin.shelf !== "auto" && pin.shelf !== ctx.shelfId) return;
      const product = ctx.byId.get(pin.productId);
      if (!product) return;

      candidates.push({
        id: pin.productId,
        // Ordered by how the admin listed them, gently — the ranker still
        // decides the final order once other signals are mixed in.
        score: 1 / (1 + index * 0.15),
        reason: {
          kind: "store",
          // An unexplained push is the one card on the shelf that cannot
          // justify itself, so it gets a plain, honest default.
          text: pin.note?.trim() || "Picked by Banaadir Mall",
          anchorName: storeName(ctx, product.store),
        },
      });
    });
    return candidates;
  },
};

export const ALL_STRATEGIES: Strategy[] = [
  adminPins,
  boughtTogether,
  similarToSeed,
  completesSeed,
  moreFromSeedStore,
  fromTaste,
  continueBrowsing,
  becauseYouSaved,
  completesBasket,
  completesSaved,
  priceDrops,
  newFromYourStores,
  rising,
  popular,
  discover,
];

export const STRATEGY_BY_KEY = new Map(ALL_STRATEGIES.map((s) => [s.key, s]));

/** Helpers for reason copy, shared with the shelf composer. */
export { categoryName, storeName };

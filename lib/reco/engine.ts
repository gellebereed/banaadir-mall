/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE BLENDER — turning many opinions into one shelf.
 * ─────────────────────────────────────────────────────────────────────────
 * Strategies each nominate products with their own scoring scale. This
 * merges them into a single ranking, then does the part that most
 * recommenders skip: it decides what NOT to show.
 *
 * ── 1. Normalise before mixing ───────────────────────────────────────────
 * A co-purchase score peaks around 0.4 and a content-similarity score
 * around 0.9. Adding them raw means content similarity always wins,
 * whatever weights you set. Each strategy's output is scaled against its
 * own best candidate first, so the weights actually mean what they say.
 *
 * ── 2. Reward agreement ──────────────────────────────────────────────────
 * When two strategies that share no inputs — say, "people bought these
 * together" and "this matches your taste" — nominate the same product, that
 * agreement is better evidence than either score. It gets a bonus. This is
 * the cheapest quality win in the whole system.
 *
 * ── 3. Diversify, hard ───────────────────────────────────────────────────
 * A pure ranking of "most similar to what you like" returns eight versions
 * of one thing. It looks precise and converts terribly: the shopper has
 * already rejected that thing seven times by the time they reach the end of
 * the row, and there was nothing else on offer. Selection is therefore
 * maximal-marginal-relevance — each pick is penalised by how much it
 * resembles what is already on the shelf — with hard caps per store and per
 * category on top. A shelf should feel like a person chose it.
 *
 * ── 4. Spend a slot on being wrong ───────────────────────────────────────
 * One slot in roughly six goes to a product outside the shopper's
 * established taste. It costs a little relevance now and is the only thing
 * that stops the shelf converging on a single idea of who somebody is.
 * Filter bubbles are not merely an ethical problem in a shop — they are a
 * revenue problem, because the shopper stops finding anything new and
 * eventually stops browsing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { totalStock } from "../product-utils";
import { shelfDistance } from "./similarity";
import { discover, type Candidate, type RecoContext, type Strategy } from "./strategies";
import { STRATEGY_BY_KEY } from "./strategies";
import { socialProof } from "./psychology";
import type { Reason, Recommendation } from "./types";

/** How much the ranking cares about relevance vs. variety. */
const MMR_LAMBDA = 0.72;

/** No shelf may be more than this fraction one shop, or one department. */
const DEFAULT_MAX_PER_STORE = 2;
const DEFAULT_MAX_PER_CATEGORY = 3;

/** Roughly one slot in six is spent on discovery rather than confirmation. */
export const EXPLORE_RATE = 1 / 6;

/** A strategy must reach this share of its own top score to count as agreeing. */
const AGREEMENT_FLOOR = 0.18;

/** What a product already visible elsewhere on the page keeps of its score. */
const REPEAT_PENALTY = 0.3;

export interface BlendSpec {
  /** Strategy key → how much its opinion counts on this shelf. */
  weights: Record<string, number>;
  limit: number;
  /**
   * Shortest shelf worth rendering. The variety caps are only relaxed to
   * reach this, never beyond it — otherwise a catalogue dominated by one
   * department fills every shelf with it and the caps look ignored.
   */
  minimum?: number;
  /** Products already used by an earlier shelf in this stack. Hard filter. */
  exclude?: Set<string>;
  /**
   * Products the page shows outside the recommender — demoted, not removed.
   *
   * Removing them outright is the obvious move and it is wrong: on a small
   * catalogue the marketplace's own Trending and Just Landed rails hold
   * most of the products a momentum or popularity shelf would pick, so a
   * hard filter deletes those shelves entirely. Losing a whole shelf costs
   * more than showing one product twice on a long page. A heavy score
   * penalty gets both: anything else beats a repeat, and a repeat still
   * beats an empty row.
   */
  demote?: Set<string>;
  /** Reserve slots for products outside the shopper's taste. */
  explore?: boolean;
  maxPerStore?: number;
  maxPerCategory?: number;
  /** Skip the stock filter — used only where sold-out is still relevant. */
  allowSoldOut?: boolean;
  /**
   * The strategy that defines this shelf. Two things follow from setting it:
   *
   *   1. NOTHING GETS ON THE SHELF WITHOUT ITS BACKING. A shelf titled
   *      "More like what you saved" must contain things that are like what
   *      you saved. Letting a general taste match fill the row produces a
   *      heading that is simply false — and a shopper who notices that once
   *      has learned to discount every heading on the site.
   *
   *   2. IT OWNS THE CARD COPY, even where another strategy contributed
   *      more score. Otherwise the heading explains one thing and the card
   *      beneath it explains another.
   *
   * The other weights still matter: they re-rank within this strategy's
   * candidates. They just cannot introduce new ones.
   *
   * Left unset on shelves where varied explanations are the point, such as
   * "Chosen for you".
   */
  reasonFrom?: string;
  /**
   * A strategy exempt from the `reasonFrom` filter, and whose reason wins
   * outright. Used for admin pushes: a merchandiser who pins a product
   * expects to see it, and a push that silently disappears from every
   * shelf with a headline strategy would read as a broken control.
   */
  keepFrom?: string;
}

interface Merged {
  id: string;
  score: number;
  reason: Reason;
  /** Best weighted contribution seen, so the reason belongs to the winner. */
  reasonStrength: number;
  /** Set by the shelf's headline strategy — see BlendSpec.reasonFrom. */
  preferredReason?: Reason;
  /** Nominated by the `keepFrom` strategy — exempt from the headline filter. */
  pinned?: boolean;
  agreement: number;
  fromDiscovery: boolean;
}

/**
 * A blender bound to one request. Strategy results are memoised because a
 * page composes five or six shelves and most of them draw on the same
 * strategies — running `fromTaste` over the whole catalogue once per shelf
 * would dominate the request.
 */
export function createBlender(ctx: RecoContext) {
  const memo = new Map<string, Candidate[]>();

  function run(strategy: Strategy): Candidate[] {
    // A shelf-targeted strategy gets one cache entry PER shelf; everything
    // else is computed once for the whole request. See Strategy.perShelf.
    const cacheKey = strategy.perShelf
      ? `${strategy.key}|${ctx.shelfId ?? ""}`
      : strategy.key;

    const cached = memo.get(cacheKey);
    if (cached) return cached;

    let result: Candidate[];
    try {
      result = strategy.run(ctx);
    } catch {
      // One broken strategy must degrade a shelf, never break the page.
      result = [];
    }
    memo.set(cacheKey, result);
    return result;
  }

  function blend(spec: BlendSpec): Recommendation[] {
    const merged = new Map<string, Merged>();

    for (const [key, weight] of Object.entries(spec.weights)) {
      const strategy = STRATEGY_BY_KEY.get(key);
      if (!strategy || weight <= 0) continue;

      const candidates = run(strategy);
      if (candidates.length === 0) continue;

      const best = Math.max(...candidates.map((c) => c.score));
      if (!(best > 0)) continue;

      for (const candidate of candidates) {
        const normalised = candidate.score / best;
        if (normalised <= 0) continue;
        const contribution = normalised * weight;

        const isKeeper = Boolean(spec.keepFrom) && key === spec.keepFrom;
        const preferred =
          isKeeper || key === spec.reasonFrom ? candidate.reason : undefined;

        const existing = merged.get(candidate.id);
        if (existing) {
          existing.score += contribution;
          if (normalised >= AGREEMENT_FLOOR) existing.agreement += 1;
          if (isKeeper) existing.pinned = true;
          // A keeper's reason outranks the headline strategy's; otherwise
          // first writer wins, which is the headline strategy.
          if (preferred && (isKeeper || !existing.preferredReason)) {
            existing.preferredReason = preferred;
          }
          if (contribution > existing.reasonStrength) {
            existing.reason = candidate.reason;
            existing.reasonStrength = contribution;
          }
          if (key === discover.key) existing.fromDiscovery = true;
        } else {
          merged.set(candidate.id, {
            id: candidate.id,
            score: contribution,
            reason: candidate.reason,
            reasonStrength: contribution,
            preferredReason: preferred,
            pinned: isKeeper,
            agreement: normalised >= AGREEMENT_FLOOR ? 1 : 0,
            fromDiscovery: key === discover.key,
          });
        }
      }
    }

    // Concurrence between independent routes beats either route alone.
    for (const entry of merged.values()) {
      if (entry.agreement > 1) entry.score *= 1 + 0.18 * (entry.agreement - 1);

      /*
       * The repeat penalty does not apply to an admin push.
       *
       * The two rules collided in the worst possible place: a merchandiser
       * pushes the product they most want seen, which is almost always
       * already in Trending or Just Landed, so the push was cut to 30% of
       * its score and lost — the one product guaranteed to be pinned was
       * the one guaranteed not to appear. Somebody using the panel sees a
       * control that silently does nothing.
       *
       * A deliberate push outranks a tidiness heuristic. The de-duplication
       * within the recommendation stack itself (`exclude`) still holds.
       */
      if (!entry.pinned && spec.demote?.has(entry.id)) entry.score *= REPEAT_PENALTY;
    }

    const eligible = [...merged.values()]
      // A shelf only holds what its defining strategy nominated — see
      // BlendSpec.reasonFrom. Admin pushes are the documented exception.
      .filter((entry) => !spec.reasonFrom || entry.preferredReason || entry.pinned)
      .filter((entry) => isShowable(entry.id, spec))
      .sort((a, b) => b.score - a.score)
      // MMR is O(candidates × picked); there is no point walking a tail
      // that could never be chosen.
      .slice(0, Math.max(spec.limit * 6, 48));

    const picked = select(eligible, spec);

    // Exploration is applied last so it displaces the weakest exploit pick
    // rather than competing with the strongest.
    const withExploration = spec.explore ? injectExploration(picked, spec) : picked;

    return withExploration.map((entry) => {
      const product = ctx.byId.get(entry.id)!;
      return {
        product,
        score: entry.score,
        reason: entry.preferredReason ?? entry.reason,
        agreement: entry.agreement,
        proof: socialProof(product, ctx),
        exploratory: entry.fromDiscovery || undefined,
      };
    });
  }

  function isShowable(id: string, spec: BlendSpec): boolean {
    if (spec.exclude?.has(id)) return false;
    if (ctx.taste.muted.has(id)) return false;
    if (ctx.seed?.id === id) return false;
    const product = ctx.byId.get(id);
    if (!product || product.hidden) return false;
    // Recommending something nobody can buy is the fastest way to make the
    // whole shelf look broken.
    if (!spec.allowSoldOut && totalStock(product) <= 0) return false;
    return true;
  }

  /** Greedy maximal-marginal-relevance with hard variety caps. */
  function select(candidates: Merged[], spec: BlendSpec): Merged[] {
    const limit = spec.limit;
    const maxPerStore = spec.maxPerStore ?? DEFAULT_MAX_PER_STORE;
    const maxPerCategory = spec.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;

    const picked: Merged[] = [];
    const remaining = [...candidates];
    const storeCount = new Map<string, number>();
    const categoryCount = new Map<string, number>();

    while (picked.length < limit && remaining.length > 0) {
      let bestIndex = -1;
      let bestValue = -Infinity;
      let fallbackIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const product = ctx.byId.get(remaining[i].id)!;
        if (fallbackIndex === -1) fallbackIndex = i;

        // Caps are relaxed rather than enforced into an empty shelf — a
        // three-product category should still fill a rail.
        const overStore = (storeCount.get(product.store) ?? 0) >= maxPerStore;
        const overCategory = (categoryCount.get(product.category) ?? 0) >= maxPerCategory;
        if (overStore || overCategory) continue;

        let closest = 0;
        for (const chosen of picked) {
          const distance = shelfDistance(product, ctx.byId.get(chosen.id)!, ctx.index);
          if (distance > closest) closest = distance;
        }

        const value = MMR_LAMBDA * remaining[i].score - (1 - MMR_LAMBDA) * closest;
        if (value > bestValue) {
          bestValue = value;
          bestIndex = i;
        }
      }

      // Every remaining candidate is capped out. Only relax if the shelf
      // would otherwise be too short to render at all.
      if (bestIndex === -1) {
        if (picked.length >= Math.min(spec.minimum ?? 4, limit)) break;
        bestIndex = fallbackIndex;
        if (bestIndex === -1) break;
      }

      const chosen = remaining.splice(bestIndex, 1)[0];
      const product = ctx.byId.get(chosen.id)!;
      storeCount.set(product.store, (storeCount.get(product.store) ?? 0) + 1);
      categoryCount.set(product.category, (categoryCount.get(product.category) ?? 0) + 1);
      picked.push(chosen);
    }

    return picked;
  }

  /**
   * Give one slot to something the shopper has not been shown a version of
   * before. Placed in the middle rather than at the end — an exploration
   * pick parked in the last slot of a horizontal rail is never seen, which
   * makes the whole exercise pointless.
   */
  function injectExploration(picked: Merged[], spec: BlendSpec): Merged[] {
    const slots = Math.max(1, Math.round(spec.limit * EXPLORE_RATE));
    if (picked.length < 4) return picked;
    if (picked.filter((entry) => entry.fromDiscovery).length >= slots) return picked;

    const chosen = new Set(picked.map((entry) => entry.id));
    const pool = run(discover).filter(
      (candidate) => !chosen.has(candidate.id) && isShowable(candidate.id, spec),
    );
    if (pool.length === 0) return picked;

    const best = pool[0];
    const result = [...picked];
    // Displace the weakest pick, not the strongest.
    result.pop();
    const position = Math.min(result.length, Math.max(2, Math.floor(result.length / 2)));
    result.splice(position, 0, {
      id: best.id,
      score: best.score,
      reason: best.reason,
      reasonStrength: best.score,
      agreement: 1,
      fromDiscovery: true,
    });
    return result;
  }

  return { blend, run };
}

export type Blender = ReturnType<typeof createBlender>;

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE CO-PURCHASE GRAPH — what real baskets say goes with what.
 * ─────────────────────────────────────────────────────────────────────────
 * The strongest evidence a marketplace owns is its own order history. This
 * builds, from it, an edge between every pair of products that has ever
 * shared a basket, scored so that the edges mean something.
 *
 * ── Baskets are re-assembled before anything is counted ──────────────────
 * One checkout here becomes one order record PER STORE (see
 * lib/order-utils.ts): "BM-12345" splits into "BM-12345-KARA" and
 * "BM-12345-USPO". Counting those as two separate baskets would make the
 * graph blind to exactly the pairings that matter most on a marketplace —
 * the ones that cross shops, where the shopper could not have found the
 * partner product by browsing the first seller's page. So parcels are
 * merged back by base id first.
 *
 * ── Why not raw co-occurrence counts ─────────────────────────────────────
 * The bestseller co-occurs with everything, because it is on every third
 * order. Rank by raw counts and every "frequently bought together" module
 * on the site recommends the same two items — which is both useless and the
 * fastest way to teach shoppers that the module is an advert.
 *
 * The score is therefore built from three parts:
 *
 *   confidence  P(B | A)  — of the baskets holding A, how many held B.
 *   lift        confidence / P(B) — how much MORE often than chance. This
 *               is what demotes the universal bestseller: its P(B) is high,
 *               so co-occurring with it is unremarkable.
 *   shrinkage   co / (co + PRIOR) — a pair seen once is a coincidence, not
 *               a pattern. This pulls thin evidence toward zero instead of
 *               letting a single order mint a confident recommendation.
 *
 * ── Complements vs. substitutes ──────────────────────────────────────────
 * Two products in the same category that co-occur are usually a
 * substitute-ish pairing (two shirts). Across categories, it is usually a
 * genuine complement (a kettle and a set of mugs). The graph keeps them
 * apart because the shelves ask different questions: "you may also like"
 * wants substitutes, "completes your basket" wants complements, and mixing
 * them produces a bundle nobody would ever buy — a duvet with a duvet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Order, Product } from "../types";
import { baseOrderId } from "../order-utils";

/**
 * Evidence needed before a pair is worth half its confidence score. Set by
 * how thin real early-marketplace data is: at 3, a pair seen twice scores
 * 40% and a pair seen ten times scores 77%.
 */
const SHRINKAGE_PRIOR = 3;

/**
 * Pairs seen fewer times than this never enter the graph.
 *
 * Set to 1 deliberately: the shrinkage term above already ranks a pair seen
 * once at a quarter of the weight of one seen five times, so a hard cut-off
 * on top of it would buy very little and cost a young marketplace every
 * "goes with this" shelf it has. The card quotes the real count — "1
 * shopper bought both" — so a thin edge presents itself as thin.
 *
 * The bundle box, which adds items to a basket in one click, holds itself
 * to a higher bar separately (lib/reco/psychology.ts, BUNDLE_MIN_CO_ORDERS).
 */
const MIN_CO_ORDERS = 1;

/** Keep the strongest edges per product; the tail is noise and memory. */
const MAX_EDGES_PER_PRODUCT = 24;

export interface AffinityEdge {
  id: string;
  /** Baskets containing both. The number shown as provenance. */
  coOrders: number;
  /** 0–1ish, shrunk confidence × lift. */
  score: number;
  /** Different category — a genuine "goes with", not an alternative. */
  complement: boolean;
}

export interface AffinityGraph {
  /** product id → its strongest partners, best first. */
  edges: Map<string, AffinityEdge[]>;
  /** How many baskets each product appeared in. */
  basketCount: Map<string, number>;
  /** Total baskets considered. */
  baskets: number;
}

export function buildAffinityGraph(orders: Order[], products: Product[]): AffinityGraph {
  const categoryOf = new Map(products.map((p) => [p.id, p.category]));
  const live = new Set(products.map((p) => p.id));

  // 1. Re-assemble baskets across the per-store parcel split.
  const baskets = new Map<string, Set<string>>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const key = baseOrderId(order.id);
    let basket = baskets.get(key);
    if (!basket) baskets.set(key, (basket = new Set()));
    for (const item of order.items ?? []) {
      // Delisted products are dropped here rather than filtered later, so
      // they cannot dilute the P(B) denominators.
      if (live.has(item.productId)) basket.add(item.productId);
    }
  }

  // 2. Count.
  const basketCount = new Map<string, number>();
  const pairCount = new Map<string, Map<string, number>>();
  let basketTotal = 0;

  for (const basket of baskets.values()) {
    if (basket.size === 0) continue;
    basketTotal++;

    const ids = [...basket];
    for (const id of ids) basketCount.set(id, (basketCount.get(id) ?? 0) + 1);

    // A basket of 30 lines would be 435 pairs; realistic baskets are small,
    // but a bulk order shouldn't be allowed to dominate the whole graph.
    if (ids.length > 12) continue;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPair(pairCount, ids[i], ids[j]);
        addPair(pairCount, ids[j], ids[i]);
      }
    }
  }

  // 3. Score.
  const edges = new Map<string, AffinityEdge[]>();
  if (basketTotal === 0) return { edges, basketCount, baskets: 0 };

  for (const [id, partners] of pairCount) {
    const countA = basketCount.get(id) ?? 0;
    if (countA === 0) continue;

    const scored: AffinityEdge[] = [];
    for (const [partnerId, co] of partners) {
      if (co < MIN_CO_ORDERS) continue;
      const countB = basketCount.get(partnerId) ?? 0;
      if (countB === 0) continue;

      const confidence = co / countA;
      const expected = countB / basketTotal;
      const lift = expected > 0 ? confidence / expected : 0;

      /**
       * Drop only pairs that co-occur LESS than chance would predict.
       *
       * The obvious filter here is `lift <= 1` — insist on a positive
       * association. On a mature order book that is right; on a young one
       * it silently deletes the entire graph, and the failure is invisible
       * because an empty shelf just doesn't render.
       *
       * The reason is arithmetic: when a product appears in most of the
       * baskets there are, every partner's lift lands on exactly 1.0, and
       * a strict cut-off throws away the marketplace's only co-purchase
       * evidence at precisely the point it has least to spare. Weak
       * association is already handled properly by the shrinkage term
       * below — a pair seen once scores a quarter of one seen five times —
       * so this stays a floor against genuine anti-correlation and nothing
       * more.
       */
      if (lift < 1) continue;

      const shrink = co / (co + SHRINKAGE_PRIOR);
      scored.push({
        id: partnerId,
        coOrders: co,
        score: confidence * Math.log2(1 + lift) * shrink,
        complement: categoryOf.get(id) !== categoryOf.get(partnerId),
      });
    }

    if (scored.length === 0) continue;
    scored.sort((a, b) => b.score - a.score);
    edges.set(id, scored.slice(0, MAX_EDGES_PER_PRODUCT));
  }

  return { edges, basketCount, baskets: basketTotal };
}

function addPair(
  pairs: Map<string, Map<string, number>>,
  from: string,
  to: string,
): void {
  let row = pairs.get(from);
  if (!row) pairs.set(from, (row = new Map()));
  row.set(to, (row.get(to) ?? 0) + 1);
}

/** Partners of one product, optionally restricted to genuine complements. */
export function partnersOf(
  graph: AffinityGraph,
  productId: string,
  options: { complementsOnly?: boolean; limit?: number } = {},
): AffinityEdge[] {
  const edges = graph.edges.get(productId) ?? [];
  const filtered = options.complementsOnly ? edges.filter((e) => e.complement) : edges;
  return options.limit ? filtered.slice(0, options.limit) : filtered;
}

/**
 * Partners of a whole basket, merged.
 *
 * Scores are summed across seeds and then given a small bonus for how many
 * distinct basket items point at them — something that goes with three of
 * your items is a better suggestion than something strongly tied to one.
 * Anything already in the basket is excluded.
 */
export function partnersOfSet(
  graph: AffinityGraph,
  seedIds: string[],
  options: { complementsOnly?: boolean } = {},
): { id: string; score: number; coOrders: number; from: string[] }[] {
  const seeds = new Set(seedIds);
  const merged = new Map<string, { score: number; coOrders: number; from: string[] }>();

  for (const seedId of seeds) {
    for (const edge of partnersOf(graph, seedId, options)) {
      if (seeds.has(edge.id)) continue;
      const existing = merged.get(edge.id);
      if (existing) {
        existing.score += edge.score;
        existing.coOrders = Math.max(existing.coOrders, edge.coOrders);
        existing.from.push(seedId);
      } else {
        merged.set(edge.id, { score: edge.score, coOrders: edge.coOrders, from: [seedId] });
      }
    }
  }

  return [...merged.entries()]
    .map(([id, value]) => ({
      id,
      ...value,
      score: value.score * (1 + 0.25 * (value.from.length - 1)),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE PERSUASION LAYER — and the line it will not cross.
 * ─────────────────────────────────────────────────────────────────────────
 * The behavioural effects used here are the well-evidenced ones, and each
 * is implemented against a real record rather than a plausible-looking
 * number:
 *
 *   Scarcity          shown only from actual stock, at or under
 *                     LOW_STOCK_VISIBLE units. Never a countdown, never
 *                     "3 people are viewing this".
 *   Social proof      counted from real orders in a real window. Absent
 *                     when the marketplace has not sold enough for the
 *                     claim to be true, which on a young site is often.
 *   Loss aversion     price drops, on products the shopper had already
 *                     shown interest in. The drop is a live promotion, not
 *                     a struck-through price that was never charged.
 *   Goal gradient     progress toward the admin's OWN free-delivery
 *                     threshold, with products that genuinely close the gap.
 *   Set completion    complements with co-purchase evidence behind them.
 *   Reason-why        every card states what earned it the slot.
 *
 * ── Why the restraint is the strategy, not a tax on it ───────────────────
 * Fabricated urgency works once. The second time a shopper sees "only 2
 * left" on something that is still there next week, every other claim on
 * the site is retrospectively downgraded — including the true ones, and
 * including the recommendations themselves. On a marketplace whose whole
 * proposition is trusting sellers you cannot visit, that is the expensive
 * kind of cheap win.
 *
 * The moat is not the ranking. Any competitor can copy a ranking. The moat
 * is being the shop whose nudges turn out to be true, because that is what
 * makes the nudges keep working.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { discountPct, money } from "../format";
import { totalStock } from "../product-utils";
import type { MarketingSettings, Product } from "../types";
import { partnersOf } from "./affinity";
import { momentumLine } from "./momentum";
import type { RecoContext } from "./strategies";
import { tasteScore } from "./taste";
import type { Bundle, DeliveryGoal, SocialProof } from "./types";

/** Stock at or below this is worth saying out loud. Above it, silence. */
export const LOW_STOCK_VISIBLE = 5;

/** Reviews needed before a star average is evidence rather than an accident. */
const RATING_EVIDENCE_FLOOR = 10;

/** Assemble whatever is honestly true about this product, and nothing else. */
export function socialProof(product: Product, ctx: RecoContext): SocialProof | undefined {
  const proof: SocialProof = {};

  const stock = totalStock(product);
  if (stock > 0 && stock <= LOW_STOCK_VISIBLE) {
    proof.scarcity = stock === 1 ? "Last one" : `Only ${stock} left`;
  }

  const momentum = momentumLine(ctx.momentum, product.id);
  if (momentum) proof.momentum = momentum;

  if (product.reviewCount >= RATING_EVIDENCE_FLOOR) {
    proof.rating = `★ ${product.rating.toFixed(1)} · ${product.reviewCount.toLocaleString()}`;
  }

  if (product.compareAt && product.compareAt > product.price) {
    proof.savings = `${discountPct(product.price, product.compareAt)}% off`;
  }

  return Object.keys(proof).length > 0 ? proof : undefined;
}

// ── Frequently bought together ─────────────────────────────────────────

/** Partners must have this much of the seed's own best edge to join a bundle. */
const BUNDLE_EDGE_FLOOR = 0.35;

/**
 * A bundle partner must have shared a basket at least this many times.
 *
 * Stricter than the graph's own floor on purpose. A shelf that suggests
 * something on thin evidence costs a glance; a one-click "add all three"
 * built on a single coincidental order puts an unwanted item in somebody's
 * basket, and they find out at the till.
 */
const BUNDLE_MIN_CO_ORDERS = 2;

/**
 * The bundle box.
 *
 * Held to a much higher bar than a recommendation shelf, because a bundle
 * asks for one click to add several things — a bad partner in there is not
 * a bad suggestion, it is an unwanted item in somebody's basket. Only
 * partners with real co-purchase evidence qualify; content similarity is
 * not admitted at all. A seed with no history simply gets no bundle, and
 * the page renders without it.
 */
export function buildBundle(seed: Product, ctx: RecoContext, limit = 2): Bundle | undefined {
  const edges = partnersOf(ctx.graph, seed.id, { limit: 12 }).filter(
    (edge) => edge.coOrders >= BUNDLE_MIN_CO_ORDERS,
  );
  if (edges.length === 0) return undefined;

  const strongest = edges[0].score;
  const partners: Bundle["partners"] = [];
  const usedCategories = new Set([seed.category]);

  for (const edge of edges) {
    if (partners.length >= limit) break;
    if (edge.score < strongest * BUNDLE_EDGE_FLOOR) break;

    const product = ctx.byId.get(edge.id);
    if (!product || product.hidden || totalStock(product) <= 0) continue;
    if (ctx.taste.muted.has(product.id)) continue;
    // Two partners from one category turns a bundle into a multipack.
    if (usedCategories.has(product.category) && partners.length > 0) continue;

    usedCategories.add(product.category);
    partners.push({ product, coOrders: edge.coOrders });
  }

  if (partners.length === 0) return undefined;

  const all = [seed, ...partners.map((p) => p.product)];
  const total = all.reduce((sum, product) => sum + product.price, 0);
  const saving = all.reduce(
    (sum, product) =>
      sum + (product.compareAt && product.compareAt > product.price
        ? product.compareAt - product.price
        : 0),
    0,
  );

  const evidence = Math.max(...partners.map((p) => p.coOrders));
  return {
    seed,
    partners,
    total: round2(total),
    saving: round2(saving),
    basis: `Based on ${evidence} real order${evidence === 1 ? "" : "s"} that included ${seed.name}`,
  };
}

// ── Free-delivery goal ─────────────────────────────────────────────────

/**
 * How close the basket is to free delivery, and what would actually close
 * the gap.
 *
 * The goal-gradient effect — people push harder the nearer a goal looks —
 * is only worth using when the goal is the shopper's, not the shop's. So
 * the threshold is the admin's real one, the remaining figure is exact, and
 * the suggested items are chosen to be *worth buying*: they are ranked by
 * fit to the shopper's taste first, and only then by how neatly they close
 * the gap. Sorting purely by "cheapest thing that crosses the line" is how
 * this module ends up recommending a phone case to somebody buying towels.
 */
export function deliveryGoal(
  subtotal: number,
  marketing: MarketingSettings,
  ctx: RecoContext,
): DeliveryGoal | undefined {
  const threshold = marketing.delivery?.freeThreshold ?? 0;
  if (threshold <= 0) return undefined;

  const remaining = Math.max(0, round2(threshold - subtotal));
  const reached = remaining <= 0;

  const closers = reached
    ? []
    : ctx.products
        .filter((product) => {
          if (product.hidden || totalStock(product) <= 0) return false;
          if (ctx.cartIds.includes(product.id)) return false;
          if (ctx.taste.muted.has(product.id)) return false;
          // Must genuinely cross the line, without doubling the basket to
          // save a delivery fee — which is a worse deal, and shoppers know it.
          return product.price >= remaining && product.price <= Math.max(remaining * 2.2, remaining + 12);
        })
        .map((product) => ({
          product,
          fit: tasteScore(product, ctx.taste),
          overshoot: product.price - remaining,
        }))
        .sort((a, b) => b.fit - a.fit || a.overshoot - b.overshoot)
        .slice(0, 4)
        .map((entry) => entry.product);

  return {
    threshold,
    subtotal: round2(subtotal),
    remaining,
    progress: threshold > 0 ? Math.min(1, subtotal / threshold) : 0,
    reached,
    fee: marketing.delivery?.fee ?? 0,
    closers,
  };
}

/** The sentence the meter shows. Kept here so the wording has one home. */
export function goalCopy(goal: DeliveryGoal): string {
  if (goal.reached) return "Delivery is on us 🚚";
  return `${money(goal.remaining)} away from free delivery`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

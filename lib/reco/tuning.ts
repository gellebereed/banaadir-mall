/**
 * ─────────────────────────────────────────────────────────────────────────
 *  AUTO-TUNING — the strategy weights, adjusted by what actually works.
 * ─────────────────────────────────────────────────────────────────────────
 * The weights in shelves.ts are an expert's guesses. Shelf metrics now say
 * how each strategy's picks perform (metrics.ts#strategyStats), so each
 * strategy gets a multiplier on its weight:
 *
 *   value per card = (taps + 4·add-to-basket + 10·orders) / cards shown
 *
 * compared with the average across all strategies, shrunk toward "average"
 * until a strategy has enough cards behind it, then softened (square root)
 * and clamped to 0.6–1.6. So tuning nudges, never overturns: a strategy
 * can't vanish on one bad week, and nothing moves until there is real
 * evidence. Admin pushes and the discovery slot are never tuned — the
 * first is a decision, the second exists precisely to show things that
 * have not yet proven themselves.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { StrategyStats } from "./metrics";

/** No tuning at all below this many cards shown in total. */
export const MIN_TOTAL_IMPRESSIONS = 2000;
/** Cards a strategy needs for its own figure to count for half. */
const SHRINK_IMPRESSIONS = 400;
const MIN_MULTIPLIER = 0.6;
const MAX_MULTIPLIER = 1.6;
/** Never tuned — see above. */
const EXEMPT = new Set(["pins", "discover"]);

export interface Tuning {
  /** strategy key → weight multiplier (absent = 1). */
  multipliers: Map<string, number>;
  /** False while collecting evidence. */
  active: boolean;
  totalImpressions: number;
}

const valueOf = (s: StrategyStats) => s.clicks + 4 * s.carts + 10 * s.orders;

export function computeTuning(stats: StrategyStats[] | null): Tuning {
  const rows = (stats ?? []).filter((s) => !EXEMPT.has(s.via));
  const totalImpressions = rows.reduce((n, s) => n + s.impressions, 0);
  const multipliers = new Map<string, number>();
  if (totalImpressions < MIN_TOTAL_IMPRESSIONS) return { multipliers, active: false, totalImpressions };

  const average = rows.reduce((n, s) => n + valueOf(s), 0) / totalImpressions;
  if (!(average > 0)) return { multipliers, active: false, totalImpressions };

  for (const s of rows) {
    if (s.impressions <= 0) continue;
    // Shrunk toward the average by how little evidence there is.
    const rate = (valueOf(s) + average * SHRINK_IMPRESSIONS) / (s.impressions + SHRINK_IMPRESSIONS);
    const ratio = Math.sqrt(rate / average);
    multipliers.set(s.via, Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Math.round(ratio * 100) / 100)));
  }
  return { multipliers, active: true, totalImpressions };
}

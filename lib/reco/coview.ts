/**
 * ─────────────────────────────────────────────────────────────────────────
 *  VIEWED TOGETHER — what shoppers compare.
 * ─────────────────────────────────────────────────────────────────────────
 * The co-purchase graph (affinity.ts) is the best evidence there is, but a
 * young marketplace has few orders. Views are fifty times more plentiful,
 * and two products looked at in the same visit are usually two options for
 * the same need — the "shoppers also viewed" signal.
 *
 * Collected anonymously: the browser reports only "A and B were viewed in
 * one visit" (lib/reco/metrics-client.ts#recordView) — no session, no
 * shopper. Pairs seen fewer than twice never arrive (the SQL drops them).
 *
 * Scored as a cosine over co-view counts, n(A,B) / √(n(A)·n(B)), so a
 * product everyone glances at doesn't become "also viewed" with everything
 * — the same trap the co-purchase graph avoids with lift — and shrunk by
 * evidence so a pair seen twice counts for less than a pair seen twenty
 * times.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type CoviewGraph = Map<string, { id: string; score: number; n: number }[]>;

/** Pairs needed before a link counts for half its score. */
const SHRINKAGE = 4;
/** Neighbours kept per product. */
const KEEP = 30;

export function buildCoviewGraph(pairs: { a: string; b: string; n: number }[]): CoviewGraph {
  const totals = new Map<string, number>();
  for (const { a, b, n } of pairs) {
    totals.set(a, (totals.get(a) ?? 0) + n);
    totals.set(b, (totals.get(b) ?? 0) + n);
  }
  const graph: CoviewGraph = new Map();
  const link = (from: string, to: string, n: number, score: number) => {
    const list = graph.get(from) ?? [];
    list.push({ id: to, score, n });
    graph.set(from, list);
  };
  for (const { a, b, n } of pairs) {
    const cosine = n / Math.sqrt((totals.get(a) ?? n) * (totals.get(b) ?? n));
    const score = cosine * (n / (n + SHRINKAGE));
    link(a, b, n, score);
    link(b, a, n, score);
  }
  for (const [id, list] of graph) {
    graph.set(id, list.sort((x, y) => y.score - x.score).slice(0, KEEP));
  }
  return graph;
}

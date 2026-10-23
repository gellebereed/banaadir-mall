/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHAT A CATEGORY HOLDS — evidence for linking it to the standard.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. A category's NAME is the weakest clue to what it means.
 * Supplier groupings arrive as "Solids", "Arm Buttons", "5 Pockets"; a
 * shop's own names are "Ramadan Picks" or "Essentials". Matching the name
 * alone proposed whatever shared a word with it — and since the AI could
 * only choose among those, a right answer that shared no word with the
 * name was never even offered to it.
 *
 * The products say what the category is. So every product in it (its
 * subcategories included — a department's products all live below it) is
 * matched to the standard on its own, the matches are tallied up the
 * tree, and the proposal is the MOST SPECIFIC node that most of the
 * products agree on:
 *
 *   38 products: 31 shirts, 5 polos, 2 T-shirts
 *     → Shirts & Tops (all 38), not Shirts (31) and not Clothing (vague)
 *
 * The name still counts, as a tie-breaker and for a category with no
 * products yet; and a child category is expected to sit inside the node
 * its parent is linked to.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { standardCandidates, standardNode, type StandardNode } from "./taxonomy";
import type { Category, Product } from "./types";

/** Products classified per category — enough for a clear majority, fast enough for a batch. */
const MAX_VOTERS = 80;
/** Product names shown to the AI (and on the page) as examples. */
const MAX_SAMPLES = 15;
/** A product whose best match scores below this is noise, not a vote. */
const MIN_VOTE_SCORE = 25;
/** Share of the products a node must cover to be proposed by the tally alone. */
const MAJORITY = 0.55;
/** Share a more specific node must still cover to be preferred over its parent. */
const DESCEND = 0.7;
/** Candidates offered to the AI. */
const MAX_CANDIDATES = 24;

export interface ProductSignal {
  id: string;
  path: string;
  /** Share of the classified products that fall at or under this node, 0–1. */
  share: number;
}

export interface CategoryEvidence {
  slug: string;
  name: string;
  /** "Men's Fashion / Shirts" — where it sits in our menu. */
  breadcrumb: string;
  subcategories: string[];
  /** Every product in it and below it. */
  productCount: number;
  /** How many of those the word matcher could place at all. */
  classified: number;
  /** A spread of product names, one subcategory at a time. */
  samples: string[];
  /** The strongest product consensus, broad to specific. */
  signals: ProductSignal[];
  /** The standard node the parent category is linked to, if any. */
  parentLink?: { id: string; path: string };
  /** What the AI may choose from: name matches, product matches and their parents. */
  candidates: { id: string; path: string }[];
  /** The best answer without AI. */
  proposal: { standardId: string | null; confidence: number; reason: string };
}

function ancestors(node: StandardNode): StandardNode[] {
  const out: StandardNode[] = [];
  for (let cur: StandardNode | undefined = node; cur; cur = standardNode(cur.parentId)) out.push(cur);
  return out;
}

function within(node: StandardNode, root: StandardNode | undefined): boolean {
  return Boolean(root && (node.id === root.id || node.id.startsWith(`${root.id}-`)));
}

/** Every category at or below `slug`. */
function subtree(slug: string, categories: Category[]): Set<string> {
  const out = new Set([slug]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentSlug && out.has(c.parentSlug) && !out.has(c.slug)) {
        out.add(c.slug);
        grew = true;
      }
    }
  }
  return out;
}

/** Evenly spaced, so 80 of 1,300 products are not just the first import's. */
function spread<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const step = list.length / max;
  return Array.from({ length: max }, (_, i) => list[Math.floor(i * step)]);
}

function plain(text: string | undefined, max: number): string {
  return (text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function gatherEvidence(
  category: Category,
  categories: Category[],
  products: Product[],
): CategoryEvidence {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const parent = category.parentSlug ? bySlug.get(category.parentSlug) : undefined;
  const parentNode = standardNode(parent?.standardId);
  const slugs = subtree(category.slug, categories);
  const inside = products.filter((p) => slugs.has(p.category));
  const subcategories = categories.filter((c) => c.parentSlug === category.slug).map((c) => c.name);

  const breadcrumb: string[] = [];
  for (let c: Category | undefined = category; c; c = c.parentSlug ? bySlug.get(c.parentSlug) : undefined) {
    breadcrumb.unshift(c.name);
  }

  // ── Samples: one from each subcategory in turn, so a department's
  //    examples are not all from its biggest child. ───────────────────
  const groups = new Map<string, Product[]>();
  for (const p of inside) {
    const key = p.category === category.slug ? p.subcategory || p.category : p.category;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const samples: string[] = [];
  const queues = [...groups.values()].sort((a, b) => b.length - a.length).map((g) => [...g]);
  while (samples.length < MAX_SAMPLES && queues.some((q) => q.length)) {
    for (const q of queues) {
      const p = q.shift();
      if (!p || samples.length >= MAX_SAMPLES) continue;
      const detail = [bySlug.get(p.category)?.name !== category.name ? bySlug.get(p.category)?.name : "", p.subcategory]
        .filter(Boolean)
        .join(", ");
      samples.push(detail ? `${p.name} (${detail})` : p.name);
    }
  }

  // ── The tally: each product votes for its best match and that match's
  //    ancestors, at most once per node. ──────────────────────────────
  const support = new Map<string, number>();
  let classified = 0;
  for (const p of spread(inside, MAX_VOTERS)) {
    const context = [p.subcategory ?? "", bySlug.get(p.category)?.name ?? "", plain(p.description, 160)].filter(Boolean);
    const [first, second] = standardCandidates(p.name, context, 2, false);
    if (!first || first.score < MIN_VOTE_SCORE) continue;
    classified++;
    const weights = new Map<string, number>();
    for (const node of ancestors(first.node)) weights.set(node.id, 1);
    // A close runner-up is half a vote: "Polo Shirt" is both a polo and a shirt.
    if (second && second.score >= first.score * 0.85) {
      for (const node of ancestors(second.node)) weights.set(node.id, Math.max(weights.get(node.id) ?? 0, 0.5));
    }
    for (const [id, w] of weights) support.set(id, (support.get(id) ?? 0) + w);
  }

  const signals: ProductSignal[] = classified
    ? [...support.entries()]
        .map(([id, total]) => ({ node: standardNode(id)!, share: Math.min(1, total / classified) }))
        .filter((s) => s.share >= 0.15)
        .sort((a, b) => b.share - a.share || b.node.depth - a.node.depth)
        .slice(0, 12)
        .map((s) => ({ id: s.node.id, path: s.node.path, share: s.share }))
    : [];

  // ── Name matches, nudged toward the parent's link. ────────────────
  const byName = standardCandidates(
    category.name,
    [parent?.name ?? "", ...samples.slice(0, 6)].filter(Boolean),
    10,
    !category.parentSlug,
  );
  const nameRank = new Map(byName.map((c, i) => [c.node.id, i]));

  // ── The proposal without AI: walk down from the broadest node the
  //    products agree on, one level at a time, while a clear majority
  //    still fits. "Uppers" (shirts and T-shirts) stops at Clothing Tops
  //    instead of claiming all of it is Shirts. ──────────────────────
  let proposal: CategoryEvidence["proposal"];
  const shareOf = (id: string) => Math.min(1, (support.get(id) ?? 0) / Math.max(1, classified));
  const children = new Map<string, StandardNode[]>();
  for (const id of support.keys()) {
    const node = standardNode(id)!;
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const roots = [...support.keys()].map((id) => standardNode(id)!).filter((n) => !n.parentId);
  // A linked parent is where a child category is expected to sit.
  let current: StandardNode | undefined =
    parentNode && shareOf(parentNode.id) >= MAJORITY
      ? parentNode
      : roots.sort((a, b) => shareOf(b.id) - shareOf(a.id))[0];
  if (classified >= 3 && current && shareOf(current.id) >= MAJORITY) {
    for (;;) {
      const next: StandardNode | undefined = (children.get(current.id) ?? [])
        // A top-level department ("Kids & Baby") stays broad unless nearly
        // everything in it is one kind of thing.
        .filter((child) => shareOf(child.id) >= (category.parentSlug ? DESCEND : 0.9))
        .sort(
          (a, b) =>
            shareOf(b.id) + ((nameRank.get(b.id) ?? 9) < 3 ? 0.1 : 0) -
            (shareOf(a.id) + ((nameRank.get(a.id) ?? 9) < 3 ? 0.1 : 0)),
        )[0];
      if (!next) break;
      current = next;
    }
    const best = current;
    const share = shareOf(best.id);
    const covered = Math.round(share * classified);
    const example = samples[0] ? ` — e.g. “${samples[0].replace(/ \(.*\)$/, "")}”` : "";
    proposal = {
      standardId: best.id,
      // A handful of products is weaker evidence than forty, and a
      // top-level answer ("Apparel") is a safe fallback, not a finding.
      confidence: Math.round(Math.min(95, share * 100) * (classified >= 10 ? 1 : 0.85) * (best.depth === 0 ? 0.7 : 1)),
      reason: `${covered} of ${classified} products are ${best.name}${example}`,
    };
  } else {
    const ranked = byName
      .map((c) => ({ ...c, score: c.score + (parentNode ? (within(c.node, parentNode) ? 10 : -10) : 0) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    proposal = top
      ? {
          standardId: top.node.id,
          confidence: Math.max(0, Math.min(70, top.score)),
          reason:
            inside.length === 0
              ? "No products yet — matched by the category's name"
              : "Its products are too varied to agree — matched by the name",
        }
      : { standardId: null, confidence: 0, reason: "Nothing in the standard shares a word with this name or its products" };
  }

  // ── Candidates for the AI: the products' view first, then the name's,
  //    with the parents of the strongest so a broad answer is possible. ─
  const ids: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && standardNode(id) && !ids.includes(id) && ids.length < MAX_CANDIDATES) ids.push(id);
  };
  add(proposal.standardId);
  for (const s of signals) add(s.id);
  for (const c of byName.slice(0, 8)) add(c.node.id);
  for (const s of signals.slice(0, 3)) for (const node of ancestors(standardNode(s.id)!)) add(node.id);
  if (parentNode) add(parentNode.id);

  return {
    slug: category.slug,
    name: category.name,
    breadcrumb: breadcrumb.join(" / "),
    subcategories,
    productCount: inside.length,
    classified,
    samples,
    signals: signals.slice(0, 6),
    parentLink: parentNode ? { id: parentNode.id, path: parentNode.path } : undefined,
    candidates: ids.map((id) => ({ id, path: standardNode(id)!.path })),
    proposal,
  };
}

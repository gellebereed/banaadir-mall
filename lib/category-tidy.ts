/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CATEGORY TIDY-UP — proposing a home for the strays.
 * ─────────────────────────────────────────────────────────────────────────
 * A supplier import files each of its own groupings straight under the
 * department it was pointed at. Özdilek's did exactly that, and Home &
 * Living ended up with this:
 *
 *   Home & Living
 *     ├── Tableware            (20 things inside)
 *     ├── Cookware             (14 things inside)
 *     ├── Bed & Bath           (21 things inside)
 *     ├── Bedding Duvet Cover Set Singles     ← one shelf
 *     ├── Bedding Duvet Cover Set Kings       ← one shelf
 *     ├── Bathroom Bathrobes                  ← one shelf
 *     └── …thirty more like it
 *
 * Every one of those strays is either a near-duplicate of something already
 * filed properly ("Bedding Duvet Cover Sets" is "Duvet Cover Sets"), or it
 * belongs one level down inside a group that already exists. This works out
 * which, and how confident it is.
 *
 * ── It proposes. It does not decide ──────────────────────────────────────
 * Nothing here writes anything. It returns a list of suggestions with a
 * confidence and a plain-English reason, and a human ticks the ones they
 * agree with. Category structure is merchandising — it is somebody's
 * judgement about how their shop should read — and an algorithm that
 * silently reorganised it would be wrong in a way nobody could see until a
 * department went missing from the navigation.
 *
 * Pure functions, no database, no React. Testable on its own.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { categoryKey } from "./import/categories.ts";
import type { Category } from "./types";

export type TidyAction = "merge" | "reparent";

export interface TidyProposal {
  /** The stray. */
  slug: string;
  name: string;
  action: TidyAction;
  /** Where it should go: the category to merge into, or the new parent. */
  targetSlug: string;
  targetName: string;
  /** The department both sit in, for grouping the review list. */
  rootSlug: string;
  rootName: string;
  /** 0–100. Anything under REVIEW_BELOW is shown but not pre-ticked. */
  confidence: number;
  /** Why, phrased for the person deciding. */
  reason: string;
  /** Products that would move. Merges move them; re-parents do not. */
  products: number;
}

/**
 * Below this, a proposal is shown unticked.
 *
 * The tool is only useful if the default selection can be applied without
 * reading every row — and it is only trustworthy if the rows that need
 * reading are obvious. Anything the matcher is not sure about arrives
 * unticked rather than being hidden, because a hidden suggestion is one
 * nobody ever revisits.
 */
export const REVIEW_BELOW = 70;

// ── Words ──────────────────────────────────────────────────────────────

/** Words that carry no shelf meaning and dominate the overlap if kept. */
const STOP = new Set(["and", "the", "of", "for", "with", "in", "a", "an", "&"]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOP.has(token))
    .map(singular);
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("es") && /(ch|sh|x|z|s)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Do two words mean the same shelf?
 *
 * Equal, or one is a prefix of the other with at least three characters in
 * common. The prefix rule is what connects "bedding" to "bed" and
 * "bathroom" to "bath", which is the single most common relationship in
 * this whole mess and is invisible to exact matching.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/**
 * Words too generic to identify a shelf on their own.
 *
 * "Sets" is in a third of the names in this catalogue. A one-word category
 * called any of these is a container, not a thing, and merging into it on
 * the strength of that one word would file cushions with cutlery.
 */
const GENERIC = new Set([
  "set",
  "sets",
  "kit",
  "pack",
  "item",
  "product",
  "collection",
  "accessory",
  "other",
  "misc",
  "general",
]);

function isSubstantialWord(word: string): boolean {
  return word.length >= 5 && !GENERIC.has(word);
}

/**
 * How much of `inner` appears in `outer`, 0–1.
 *
 * Containment rather than Jaccard, deliberately. "Duvet Cover Sets" is
 * entirely contained in "Bedding Duvet Cover Set Kings" and that is the
 * finding — Jaccard would score it 0.6 because the longer name has extra
 * words, and dilute the strongest signal available.
 */
function containment(inner: string[], outer: string[]): number {
  if (inner.length === 0) return 0;
  const hits = inner.filter((word) => outer.some((other) => sameWord(word, other)));
  return hits.length / inner.length;
}

/**
 * The same, but words must match EXACTLY — no prefix rule.
 *
 * ── Why merging gets a stricter test than suggesting ─────────────────────
 * The prefix rule is what connects "bedding" to "bed", and it is the reason
 * the parent suggestions work at all. It also connects "bath" to
 * "bathrobe" and "pillow" to "pillowcase", and a dry run against the real
 * catalogue duly proposed merging "Towels Baths" into "Bathrobes" and
 * "Pillowcases" into "Pillows" — both wrong, both at high confidence,
 * both moving products into the wrong shelf and deleting the right one.
 *
 * Suggesting a parent is a reversible nudge, so a fuzzy signal is worth
 * having. A merge deletes a category and moves its products, so it has to
 * be the same words or nothing. Those two cases now fall through to a
 * re-parent, which is where they belonged.
 */
function exactContainment(inner: string[], outer: string[]): number {
  if (inner.length === 0) return 0;
  const outerSet = new Set(outer);
  const hits = inner.filter((word) => outerSet.has(word));
  return hits.length / inner.length;
}

// ── The tree ───────────────────────────────────────────────────────────

interface Indexed {
  byslug: Map<string, Category>;
  childrenOf: Map<string, Category[]>;
  rootOf: Map<string, string>;
}

function index(categories: Category[]): Indexed {
  const byslug = new Map(categories.map((category) => [category.slug, category]));
  const childrenOf = new Map<string, Category[]>();

  for (const category of categories) {
    if (!category.parentSlug) continue;
    const siblings = childrenOf.get(category.parentSlug) ?? [];
    siblings.push(category);
    childrenOf.set(category.parentSlug, siblings);
  }

  // Walk to the top, with a hop limit so a cycle in the data cannot hang
  // the admin page that renders this.
  const rootOf = new Map<string, string>();
  for (const category of categories) {
    let current = category.slug;
    for (let hops = 0; hops < 12; hops++) {
      const parent = byslug.get(current)?.parentSlug;
      if (!parent || !byslug.has(parent)) break;
      current = parent;
    }
    rootOf.set(category.slug, current);
  }

  return { byslug, childrenOf, rootOf };
}

// ── The proposals ──────────────────────────────────────────────────────

export function proposeTidy(
  categories: Category[],
  /** Slug → how many products are filed directly under it. */
  productCounts: Map<string, number> = new Map(),
): TidyProposal[] {
  const { byslug, childrenOf, rootOf } = index(categories);

  /**
   * A stray: filed straight under a department, with nothing inside it.
   *
   * Both halves matter. Something with children of its own is a group and
   * belongs where it is, whatever it is called; something nested deeper has
   * already been placed by somebody.
   */
  const strays = categories.filter(
    (category) =>
      category.parentSlug &&
      byslug.has(category.parentSlug) &&
      !byslug.get(category.parentSlug)!.parentSlug &&
      (childrenOf.get(category.slug)?.length ?? 0) === 0,
  );

  const proposals: TidyProposal[] = [];

  for (const stray of strays) {
    const root = rootOf.get(stray.slug);
    if (!root) continue;

    // Only ever within the same department. Moving "Bedding Pillows" out of
    // Home & Living and into Kids & Baby because the words happened to line
    // up is not a tidy-up, it is a catalogue reorganisation nobody asked for.
    const family = categories.filter(
      (category) => category.slug !== stray.slug && rootOf.get(category.slug) === root,
    );

    const strayTokens = tokens(stray.name);
    const strayKey = categoryKey(stray.name);

    const best =
      findMerge(stray, strayTokens, strayKey, family, childrenOf, byslug) ??
      findParent(stray, strayTokens, family, childrenOf);

    if (!best) continue;

    proposals.push({
      slug: stray.slug,
      name: stray.name,
      action: best.action,
      targetSlug: best.target.slug,
      targetName: best.target.name,
      rootSlug: root,
      rootName: byslug.get(root)?.name ?? root,
      confidence: Math.round(best.confidence),
      reason: best.reason,
      products: productCounts.get(stray.slug) ?? 0,
    });
  }

  return proposals.sort(
    (a, b) =>
      a.rootName.localeCompare(b.rootName) ||
      b.confidence - a.confidence ||
      a.name.localeCompare(b.name),
  );
}

interface Match {
  action: TidyAction;
  target: Category;
  confidence: number;
  reason: string;
}

/** The stray is the same shelf as one that is already filed properly. */
function findMerge(
  stray: Category,
  strayTokens: string[],
  strayKey: string,
  family: Category[],
  childrenOf: Map<string, Category[]>,
  byslug: Map<string, Category>,
): Match | undefined {
  let best: Match | undefined;

  for (const candidate of family) {
    // Never merge into another stray, or into a group. The first just moves
    // the problem; the second would bury a whole group's contents.
    const isGroup = (childrenOf.get(candidate.slug)?.length ?? 0) > 0;
    if (isGroup) continue;

    const parent = candidate.parentSlug ? byslug.get(candidate.parentSlug) : undefined;
    const properlyFiled = Boolean(parent?.parentSlug);
    if (!properlyFiled) continue;

    const candidateTokens = tokens(candidate.name);

    // Same name once normalised — the unambiguous case.
    if (strayKey && categoryKey(candidate.name) === strayKey) {
      const match: Match = {
        action: "merge",
        target: candidate,
        confidence: 97,
        reason: `Same shelf as “${candidate.name}”, which is already filed under ${parent!.name}.`,
      };
      if (!best || match.confidence > best.confidence) best = match;
      continue;
    }

    /*
     * ── The stray's name CONTAINS the other one in full ─────────────────
     *
     * "Bedding Duvet Cover Sets" contains "Duvet Cover Sets": the import
     * prefixed its own grouping onto a shelf the catalogue already had.
     *
     * Two conditions, and both are load-bearing.
     *
     * The candidate must SAY something. A single generic word — "Sets",
     * "Kits", "Items" — is contained in half the catalogue and would
     * swallow it; a single substantial one ("Bathrobes") is the whole
     * meaning of the shelf and is exactly the match wanted.
     *
     * And the stray may add at most ONE word. One extra word is the
     * importer's prefix ("Bedding", "Bathroom") and the two are the same
     * shelf. Two or more means it is genuinely narrower — "Bedding Duvet
     * Cover Set KINGS" is king-size, and folding it into the general
     * "Duvet Cover Sets" would collapse three real shelves into one and
     * move the products irreversibly. Those get a parent instead, which
     * keeps them distinct and is undoable.
     */
    const substantial =
      candidateTokens.length >= 2 ||
      (candidateTokens.length === 1 && isSubstantialWord(candidateTokens[0]));

    const extra = strayTokens.length - candidateTokens.length;

    if (substantial && extra <= 1 && exactContainment(candidateTokens, strayTokens) === 1) {
      const confidence = extra === 0 ? 95 : 86;
      const match: Match = {
        action: "merge",
        target: candidate,
        confidence,
        reason: `“${candidate.name}” already exists under ${parent!.name} and means the same thing.`,
      };
      if (!best || confidence > best.confidence) best = match;
    }
  }

  return best;
}

/** No duplicate — so which existing group does it belong inside? */
function findParent(
  stray: Category,
  strayTokens: string[],
  family: Category[],
  childrenOf: Map<string, Category[]>,
): Match | undefined {
  let best: Match | undefined;

  /*
   * Candidate groups, excluding the one it is already in.
   *
   * Without that exclusion the department itself always wins: it is a
   * group (it has children), and its children include the other thirty
   * strays — so "Bedding Pique Sets" scores beautifully against "Bedding
   * Pillowcase Sets" sitting next to it, and the tool confidently proposes
   * moving it exactly where it already is. The strays are the mess; they
   * must not be evidence for keeping the mess.
   */
  const groups = family.filter(
    (category) =>
      category.slug !== stray.parentSlug &&
      (childrenOf.get(category.slug)?.length ?? 0) > 0,
  );

  for (const group of groups) {
    const children = childrenOf.get(group.slug) ?? [];

    /*
     * ── The strongest signal is the group's CONTENTS, not its name ───────
     * "Bedding Pique Sets" shares nothing with the words "Bed & Bath", but
     * it looks a great deal like the things already inside it — Duvet Cover
     * Sets, Pillowcase Sets, Fitted Sheets. Scoring against the children is
     * what makes the suggestion right; scoring against the name alone
     * mostly measures how well the department happens to be named.
     */
    let bestChild = 0;
    let bestChildName = "";
    for (const child of children) {
      const childTokens = tokens(child.name);
      const score = Math.max(
        containment(childTokens, strayTokens),
        containment(strayTokens, childTokens),
      );
      if (score > bestChild) {
        bestChild = score;
        bestChildName = child.name;
      }
    }

    const byName = containment(tokens(group.name), strayTokens);

    // Contents lead; the group's own name is corroboration.
    const score = bestChild * 0.75 + byName * 0.25;
    if (score < 0.34) continue;

    const confidence = Math.min(94, Math.round(score * 100));
    const reason =
      bestChild >= 0.5 && bestChildName
        ? `Sits naturally beside “${bestChildName}”, already inside ${group.name}.`
        : `The name lines up with ${group.name}.`;

    if (!best || confidence > best.confidence) {
      best = { action: "reparent", target: group, confidence, reason };
    }
  }

  return best;
}

/** How many strays exist at all — for "nothing to tidy" vs "23 to review". */
export function countStrays(categories: Category[]): number {
  const { byslug, childrenOf } = index(categories);
  return categories.filter(
    (category) =>
      category.parentSlug &&
      byslug.has(category.parentSlug) &&
      !byslug.get(category.parentSlug)!.parentSlug &&
      (childrenOf.get(category.slug)?.length ?? 0) === 0,
  ).length;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STANDARD TAXONOMY — lookups and matching. Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 * The data is a trimmed copy of Shopify's open product taxonomy (see
 * scripts/build-taxonomy.mjs for what was kept and why). Each Banaadir
 * category carries `standardId`, the node it means; that is what keeps
 * "what kind of thing is this" consistent however many stores join, and
 * what attributes and an AI classifier will build on.
 *
 * Our own navigation keeps its names and shape (Women's Fashion, Men's
 * Fashion…) — the standard is the meaning underneath, not the menu.
 * ─────────────────────────────────────────────────────────────────────────
 */

import data from "./taxonomy/standard.json";
import { categoryKey } from "./import/categories";

export interface StandardNode {
  id: string;
  name: string;
  parentId: string | null;
  /** "Home & Garden › Kitchen & Dining › Cookware & Bakeware" */
  path: string;
  depth: number;
}

export const TAXONOMY_RELEASE: string = data.release;

const byId = new Map<string, StandardNode>();
for (const [id, name, parentId] of data.nodes as [string, string, string | null][]) {
  byId.set(id, { id, name, parentId, path: name, depth: 0 });
}
for (const node of byId.values()) {
  const names: string[] = [];
  let cur: StandardNode | undefined = node;
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  node.path = names.join(" › ");
  node.depth = names.length - 1;
}

export function standardNode(id: string | undefined | null): StandardNode | undefined {
  return id ? byId.get(id) : undefined;
}

export function allStandardNodes(): StandardNode[] {
  return [...byId.values()];
}

// ── Matching ───────────────────────────────────────────────────────────

/**
 * Words a Banaadir (or supplier) category uses for what the taxonomy calls
 * something else. Gender words are dropped: in the standard, men's and
 * women's shirts are the same category — gender is an attribute.
 */
const SYNONYMS: Record<string, string[]> = {
  FASHION: ["APPAREL", "CLOTHING"],
  MEN: [],
  MENS: [],
  WOMEN: [],
  WOMENS: [],
  LADY: [],
  LADIE: [],
  GENT: [],
  KID: ["BABY", "TODDLER", "CHILDREN"],
  CHILD: ["BABY", "TODDLER", "CHILDREN"],
  LIVING: ["HOME"],
  GROCERY: ["FOOD", "BEVERAGE"],
  GROCERIE: ["FOOD", "BEVERAGE"],
  SPORT: ["SPORTING"],
  CARE: ["PERSONAL", "CARE"],
  PERFUME: ["FRAGRANCE"],
  SCENT: ["FRAGRANCE"],
  PHONE: ["MOBILE", "PHONE"],
  SMARTPHONE: ["SMART", "MOBILE", "PHONE"],
  PAN: ["COOKWARE", "PAN"],
  POT: ["COOKWARE", "POT"],
  SAUCEPAN: ["COOKWARE", "SAUCEPAN", "POT"],
  FRYING: ["COOKWARE", "FRYING"],
  SKILLET: ["COOKWARE", "SKILLET"],
  MOBILE: ["MOBILE", "PHONE"],
  KITCHENWARE: ["KITCHEN", "COOKWARE"],
  COOKWARE: ["COOKWARE", "BAKEWARE"],
  TABLEWARE: ["TABLEWARE", "DINNERWARE"],
  BEDDING: ["BEDDING", "LINEN"],
  FOOTWEAR: ["SHOE"],
  SNEAKER: ["SHOE", "ATHLETIC"],
  ABAYA: ["CLOTHING", "TRADITIONAL"],
  HIJAB: ["CLOTHING", "HEADWEAR", "TRADITIONAL"],
  DIRAC: ["DRESS", "TRADITIONAL"],
  MACAWIS: ["CLOTHING", "TRADITIONAL"],
  BAG: ["BAG", "HANDBAG", "LUGGAGE"],
  MAKEUP: ["COSMETIC", "MAKEUP"],
  TV: ["TELEVISION"],
  LAPTOP: ["LAPTOP", "COMPUTER"],
  APPLIANCE: ["APPLIANCE"],
};

const STOP = new Set(["AND", "OF", "THE", "FOR", "WITH", "SET", "ACCESSORY", "OTHER", "MISC", "GENERAL"]);

/**
 * Comparison words. Synonyms expand only the SHOP's side: expanding the
 * standard's names too made "Conference Phones" look as much like a
 * mobile phone as "Mobile & Smart Phones" does.
 */
function words(text: string, expand = true): string[] {
  const out: string[] = [];
  // "Non-stick" describes cookware; split, its "stick" matched pogo sticks
  // and stick vacuums ahead of the pan it was written on.
  if (expand) text = text.replace(/\bnon[\s-]?stick\b/gi, "cookware");
  // Sleeve length describes a shirt; left in, "Short sleeve" filed shirts
  // under Shorts and "Long sleeve" under Umbrella Sleeves.
  if (expand) text = text.replace(/\b(short|long|half|full)[\s-]?(sleeves?|sleeved|arms?)\b/gi, " ");
  // "T-Shirts" split into "T" (too short to keep) and "SHIRT", so T-shirts
  // and shirts were the same word — and suppliers write "TSHIRT", which
  // matched nothing at all. One token on both sides keeps them apart.
  text = text.replace(/\bt[\s-]?shirts?\b/gi, "tshirt");
  for (const raw of text.split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü']+/)) {
    const key = categoryKey(raw.replace(/'/g, ""));
    if (key.length < 2 || STOP.has(key)) continue;
    const expanded = expand ? SYNONYMS[key] : undefined;
    // Gender words map to nothing; everything else keeps itself too, so
    // "Abaya" still finds "Abayas & Jilbabs" as well as Traditional Clothing.
    if (expanded && expanded.length === 0) continue;
    out.push(key, ...(expanded ?? []));
  }
  return [...new Set(out)];
}

const nodeWords = new Map<string, { name: string[]; path: string[] }>();
function wordsOf(node: StandardNode) {
  let w = nodeWords.get(node.id);
  if (!w) {
    w = { name: words(node.name, false), path: words(node.path, false) };
    nodeWords.set(node.id, w);
  }
  return w;
}

/**
 * Word → the nodes whose path contains it. A node can only score if it
 * shares a word with the text (see standardCandidates), so this lists the
 * few hundred worth scoring instead of walking all four thousand — which
 * is what makes classifying every product in a category affordable.
 */
let pathIndex: Map<string, StandardNode[]> | null = null;
/** File order, so exact ties still sort the way a full walk sorted them. */
const fileOrder = new Map([...byId.keys()].map((id, index) => [id, index]));
function nodesSharingWords(list: string[]): StandardNode[] {
  if (!pathIndex) {
    pathIndex = new Map();
    for (const node of byId.values()) {
      for (const word of wordsOf(node).path) {
        const bucket = pathIndex.get(word);
        if (bucket) bucket.push(node);
        else pathIndex.set(word, [node]);
      }
    }
  }
  const found = new Set<StandardNode>();
  for (const word of list) for (const node of pathIndex.get(word) ?? []) found.add(node);
  return [...found].sort((a, b) => fileOrder.get(a.id)! - fileOrder.get(b.id)!);
}

export interface StandardCandidate {
  node: StandardNode;
  /** 0–100, from word overlap — the AI matcher re-ranks these. */
  score: number;
}

/**
 * The standard nodes a category name most likely means, best first.
 *
 * `context` adds weaker evidence: the parent category's name and a few
 * product names from inside it ("Coffee Cups" under Home & Living, holding
 * "Porcelain Espresso Cup Set").
 */
export function standardCandidates(
  name: string,
  context: string[] = [],
  limit = 12,
  /** Defaults to "no context given" — a bare search is treated as top-level. */
  topLevel = context.length === 0,
): StandardCandidate[] {
  const own = words(name);
  // Words actually written in the name count double a synonym's.
  const literal = new Set(words(name, false));
  const ctx = words(context.join(" ")).filter((w) => !own.includes(w));
  const wantsAccessories = /accessor/i.test(name);
  if (own.length === 0 && ctx.length === 0) return [];
  const ownKey = categoryKey(name);

  const scored: StandardCandidate[] = [];
  for (const node of nodesSharingWords([...own, ...ctx])) {
    const w = wordsOf(node);
    let s = 0;
    for (const word of own) {
      const weight = literal.has(word) ? 1 : 0.5;
      if (w.name.includes(word)) s += 3 * weight;
      else if (w.path.includes(word)) s += 1 * weight;
    }
    // "Accessories" is a stop word, so "Mobile & Smart Phone Accessories"
    // ties with the phones themselves unless something breaks the tie.
    if (!wantsAccessories && /accessor/i.test(node.name)) s -= 1;
    for (const word of ctx) if (w.path.includes(word)) s += 0.5;
    if (s === 0) continue;
    if (categoryKey(node.name) === ownKey) s += 4;
    // A top-level Banaadir category most likely means a top-level standard
    // one: "Kids & Baby" is Baby & Toddler, not Kids' Chairs — and "Women's
    // Fashion" is Apparel, not "Fashion Face Masks", whatever its products say.
    if (topLevel) s += Math.max(0, 2 - node.depth) * 1.5;
    // Share of the node's own words explained — "Cookware" beats
    // "Cookware & Bakeware Accessories" for a category called Cookware.
    const explained = w.name.filter((x) => own.includes(x)).length / Math.max(1, w.name.length);
    s += explained * 2;
    scored.push({ node, score: s });
  }
  scored.sort((a, b) => b.score - a.score || a.node.depth - b.node.depth);
  const top = scored[0]?.score ?? 1;
  return scored.slice(0, limit).map((c) => ({
    node: c.node,
    score: Math.min(95, Math.round((c.score / Math.max(top, own.length * 3 + 6)) * 100)),
  }));
}

/** Free-text search for the admin's picker. */
export function searchStandard(query: string, limit = 30): StandardNode[] {
  const q = query.trim();
  if (!q) return [];
  return standardCandidates(q, [], limit).map((c) => c.node);
}

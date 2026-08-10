/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 4 (a) — supplier groupings → the category tree.
 * ─────────────────────────────────────────────────────────────────────────
 * The shape that comes out of a fashion ERP is three levels deep:
 *
 *   gender      MEN                     → the root category (already seeded)
 *   category    SHIRT, SHOES, SUIT      → a child of that root
 *   type        Dobby Shirt, Linen …    → Product.subcategory, free text
 *
 * Which maps onto what this app already has — `categories.parent_slug` for
 * the tree, and `Product.subcategory` for the free-text level under it. No
 * schema change, and the recursive `category_tree` view renders the result
 * as "Men's Fashion / Shirts" exactly like Odoo's complete_name.
 *
 * ── Two supplier groupings that are not categories ───────────────────────
 * CEREMONY holds shoes AND bow ties; ACCESSORY holds ties, bags and
 * bracelets. They are merchandising collections, not categories, and filing
 * a ceremony shoe under "Ceremony" hides it from everyone browsing shoes.
 * Where the file has a finer grouping, we use that instead.
 *
 * BASIC SHIRT vs SHIRT is a product LINE (AC Basics), not a different kind
 * of garment — two near-identical entries in the navigation with the same
 * things under them. Merged by default, but it is a merchandising judgement
 * so `mergeBasicLines` can turn it off.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cleanText, deturkify, displayPhrase, slugify } from "./text.ts";

/** A category that already exists in the catalogue. */
export interface ExistingCategory {
  slug: string;
  name: string;
  parentSlug?: string;
}

export interface CategoryRules {
  /** Slug every imported category is filed under, e.g. "mens-fashion". */
  rootSlug: string;
  /** Treat "BASIC SHIRT" as "SHIRT". */
  mergeBasicLines: boolean;
  /** Groupings to resolve through the finer sub-group column instead. */
  mixedGroupings: string[];
  /**
   * The categories the catalogue already has.
   *
   * ── Why the importer has to know ─────────────────────────────────────
   * Without it every run answered the question "what should this be
   * called?" and never the question "does it already exist?" — so a file
   * saying TOWEL produced a brand-new "Towels" beside the "Towel Sets" the
   * shop had been selling under for a year, and the Özdilek import ended up
   * scattered across a fresh set of near-duplicate departments instead of
   * landing in the structure that was already there.
   *
   * Matching is on the NORMALISED name, not the slug, because the two
   * spellings a duplicate arrives as — singular against plural, accented
   * against not, "Bath Robe" against "Bathrobe" — differ in the slug and
   * agree once flattened.
   */
  existing?: ExistingCategory[];
}

export const DEFAULT_MIXED_GROUPINGS = ["CEREMONY", "ACCESSORY", "ACCESSORIES", "OTHER", "MISC"];

/** Gender/department → the seeded root category it belongs under. */
const ROOT_BY_GENDER: Record<string, string> = {
  MEN: "mens-fashion",
  MENS: "mens-fashion",
  MAN: "mens-fashion",
  MALE: "mens-fashion",
  ERKEK: "mens-fashion",
  WOMEN: "womens-fashion",
  WOMENS: "womens-fashion",
  WOMAN: "womens-fashion",
  FEMALE: "womens-fashion",
  KADIN: "womens-fashion",
  KIDS: "kids-baby",
  CHILD: "kids-baby",
  CHILDREN: "kids-baby",
  BABY: "kids-baby",
  COCUK: "kids-baby",
};

/** The root a file's gender column implies, when the seller hasn't chosen. */
export function rootForGender(gender: string | undefined): string | undefined {
  const key = deturkify(cleanText(gender)).toUpperCase().replace(/[^A-Z]/g, "");
  return ROOT_BY_GENDER[key];
}

/**
 * Display names for the groupings these files use. A raw "TSHIRT" in the
 * navigation looks like a typo, and "PANTS 360" like a product code.
 */
const CATEGORY_NAMES: Record<string, string> = {
  SHIRT: "Shirts",
  SHIRTS: "Shirts",
  TSHIRT: "T-Shirts",
  TSHIRTS: "T-Shirts",
  "T SHIRT": "T-Shirts",
  "SHORT SLEEVE SHIRT": "Short-Sleeve Shirts",
  "NON IRON SHIRT": "Non-Iron Shirts",
  "SHIRT JACKET": "Shirt Jackets",
  JACKET: "Jackets",
  SUIT: "Suits",
  SHOES: "Shoes",
  SHOE: "Shoes",
  PANTS: "Trousers",
  "PANTS 360": "Trousers",
  TROUSERS: "Trousers",
  SOCKS: "Socks",
  UNDERWEAR: "Underwear",
  TIE: "Ties",
  BAG: "Bags",
  BAGS: "Bags",
  BRACELET: "Bracelets",
  "BOW TIE & CUMMERBUND": "Bow Ties & Cummerbunds",
  "BOW TIE AND CUMMERBUND": "Bow Ties & Cummerbunds",
  BELT: "Belts",
  COAT: "Coats",
  KNITWEAR: "Knitwear",
  DRESS: "Dresses",
  SHORTS: "Shorts",
  ACCESSORY: "Accessories",
  ACCESSORIES: "Accessories",
};

export interface ResolvedCategory {
  slug: string;
  name: string;
  parentSlug: string;
  /** True when the sub-group was used because the category was a mixed bucket. */
  usedSubGroup: boolean;
  /**
   * The category this was recognised as, when it already existed. Lets the
   * wizard say "filed into your existing Towel Sets" rather than listing a
   * near-identical department under "will be created".
   */
  matchedExisting?: boolean;
}

/**
 * The comparison form of a category name: no accents, no punctuation, no
 * plural, no case.
 *
 *   "Bath Robes"  "BATHROBE"  "bath-robe"  →  BATHROBE
 *
 * Deliberately aggressive. Two categories that flatten to the same string
 * are the same shelf in a shop, whatever the supplier's spreadsheet called
 * them, and the cost of over-merging here ("Suit" onto "Suits") is nil
 * while the cost of under-merging is the duplicate departments this exists
 * to stop.
 */
export function categoryKey(text: string): string {
  const flat = deturkify(cleanText(text)).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return singularise(flat);
}

/** "TOWELS" → "TOWEL"; "ACCESSORIES" → "ACCESSORY"; "DRESS" → "DRESS". */
function singularise(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("IES")) return `${word.slice(0, -3)}Y`;
  // …SS, …US and …IS are not plurals: DRESS, STATUS, BASIS.
  if (/(SS|US|IS)$/.test(word)) return word;
  if (word.endsWith("ES") && /(CH|SH|X|Z|S)ES$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("S")) return word.slice(0, -1);
  return word;
}

/**
 * The category the catalogue ALREADY has for this grouping, if any.
 *
 * ── The order is the whole design ────────────────────────────────────────
 * A category inside the department being imported into beats an identically
 * named one somewhere else. "Towels" under Home & Living and "Towels" under
 * a defunct Clearance department are not interchangeable, and filing a
 * shipment into the second one because it was found first is worse than
 * creating a third.
 */
function matchExisting(
  slug: string,
  name: string,
  rules: CategoryRules,
): ExistingCategory | undefined {
  const existing = rules.existing;
  if (!existing?.length) return undefined;

  const bySlug = existing.find((c) => c.slug === slug);
  if (bySlug) return bySlug;

  const key = categoryKey(name);
  if (!key) return undefined;

  const sameKey = existing.filter(
    (c) => categoryKey(c.name) === key || categoryKey(c.slug) === key,
  );
  if (sameKey.length === 0) return undefined;

  // Inside the chosen department first — directly beneath it, then anywhere
  // in its branch, then anywhere at all.
  const parentOf = new Map(existing.map((c) => [c.slug, c.parentSlug]));
  const inRoot = (candidate: ExistingCategory): boolean => {
    let current: string | undefined = candidate.slug;
    for (let hops = 0; current && hops < 10; hops++) {
      if (current === rules.rootSlug) return true;
      current = parentOf.get(current);
    }
    return false;
  };

  return (
    sameKey.find((c) => c.parentSlug === rules.rootSlug) ??
    sameKey.find(inRoot) ??
    sameKey[0]
  );
}

/**
 * Decide which category a row belongs to.
 *
 * `category` is the supplier's main grouping, `family` the finer one.
 * Either may be blank; if both are, the caller falls back to the root.
 */
export function resolveCategory(
  category: string | undefined,
  family: string | undefined,
  rules: CategoryRules,
): ResolvedCategory | undefined {
  const main = normalizeGrouping(category);
  const sub = normalizeGrouping(family);

  const mixed = rules.mixedGroupings.map((g) => normalizeGrouping(g));
  const useSub = (!main || mixed.includes(main)) && !!sub;

  let chosen = useSub ? sub : main || sub;
  if (!chosen) return undefined;

  if (rules.mergeBasicLines) chosen = stripLinePrefix(chosen);

  const name = CATEGORY_NAMES[chosen] ?? pluralise(displayPhrase(chosen));
  const slug = slugify(name);

  /*
   * Reuse before create.
   *
   * When the shop already has this shelf, the import files into it under
   * ITS name and ITS place in the tree — the supplier's spelling does not
   * get to rename a department or move it. Only a genuinely new grouping
   * becomes a new category, hanging off the department the seller chose.
   */
  const found = matchExisting(slug, name, rules);
  if (found) {
    return {
      slug: found.slug,
      name: found.name,
      parentSlug: found.parentSlug ?? rules.rootSlug,
      usedSubGroup: useSub,
      matchedExisting: true,
    };
  }

  return {
    slug,
    name,
    parentSlug: rules.rootSlug,
    usedSubGroup: useSub,
  };
}

/**
 * Groupings that are structure, not merchandising.
 *
 * Odoo ships every database with an "All" category and puts "Saleable"
 * under it, so an export's Product Category column is full of rows saying
 * nothing more than "this is a product". Left alone they become a
 * storefront category called "Alls" containing whatever the supplier had
 * not filed yet.
 */
const STRUCTURAL_GROUPINGS = new Set([
  "ALL", "ALLS", "SALEABLE", "SALABLE", "EXPENSES", "CONSUMABLE",
  "NONE", "N A", "NA", "UNCATEGORIZED", "UNCATEGORISED", "GENEL", "DIGER",
]);

/**
 * Uppercase, de-accented, punctuation-flattened — the comparison form.
 *
 * Odoo writes a category as its full path ("All / Saleable / Kitchenware"),
 * so the leaf is taken and the structural ancestors above it are dropped.
 * A path that is nothing BUT structure resolves to no category at all,
 * which leaves the product in the seller's chosen root instead of in a
 * category named after Odoo's plumbing.
 */
function normalizeGrouping(raw: string | undefined): string {
  const flatten = (value: string) =>
    deturkify(value)
      .toUpperCase()
      .replace(/[^A-Z0-9&]+/g, " ")
      .trim();

  const segments = cleanText(raw)
    .split("/")
    .map(flatten)
    .filter((segment) => segment && !STRUCTURAL_GROUPINGS.has(segment));

  return segments[segments.length - 1] ?? "";
}

/** "BASIC SHIRT" → "SHIRT"; "PREMIUM SUIT" → "SUIT". */
function stripLinePrefix(grouping: string): string {
  const stripped = grouping.replace(/^(BASIC|PREMIUM|CLASSIC|ESSENTIAL)\s+/, "");
  return stripped || grouping;
}

function pluralise(name: string): string {
  if (!name) return name;
  if (/(s|x|z|ch|sh)$/i.test(name)) return name;
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + "ies";
  return name + "s";
}

/**
 * The subcategory to file a product under, preferring one the catalogue is
 * already using.
 *
 * ── Why this is not just "trust the file" ────────────────────────────────
 * A subcategory is created by a seller typing it on a product (see
 * getSubcategories in lib/api.ts) — there is no table, so there is nothing
 * to enforce that "Duvet Cover Set", "DUVET COVER SETS" and "Duvet cover
 * sets" are one thing. An import writes whatever the supplier's column
 * says, so a second shipment from the same brand with the column tidied up
 * silently splits the shelf in two, and the filter on the products page
 * grows a near-duplicate for every variation of spelling.
 *
 * So a name that flattens to something already in use is stored in the
 * EXISTING spelling. A genuinely new one is kept exactly as written.
 */
export function resolveSubcategory(
  productType: string | undefined,
  existing: string[] = [],
): string | undefined {
  const name = displayPhrase(productType ?? "");
  if (!name) return undefined;

  const key = categoryKey(name);
  if (!key) return name;

  return existing.find((candidate) => categoryKey(candidate) === key) ?? name;
}

/**
 * Every category an import needs, deduplicated — what the commit step
 * creates before writing any product, so no product lands in a category
 * that doesn't exist.
 */
export function collectCategories(resolved: (ResolvedCategory | undefined)[]): ResolvedCategory[] {
  const bySlug = new Map<string, ResolvedCategory>();
  for (const category of resolved) {
    if (category && !bySlug.has(category.slug)) bySlug.set(category.slug, category);
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

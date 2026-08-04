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

export interface CategoryRules {
  /** Slug every imported category is filed under, e.g. "mens-fashion". */
  rootSlug: string;
  /** Treat "BASIC SHIRT" as "SHIRT". */
  mergeBasicLines: boolean;
  /** Groupings to resolve through the finer sub-group column instead. */
  mixedGroupings: string[];
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
  return {
    slug: slugify(name),
    name,
    parentSlug: rules.rootSlug,
    usedSubGroup: useSub,
  };
}

/** Uppercase, de-accented, punctuation-flattened — the comparison form. */
function normalizeGrouping(raw: string | undefined): string {
  return deturkify(cleanText(raw))
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim();
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

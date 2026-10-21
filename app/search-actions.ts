"use server";

/**
 * Suggestions under the header search box while the shopper types: the
 * best few products (same ranking as the results page), plus departments
 * and stores whose name matches. Small on purpose — this runs per pause in
 * typing.
 */

import { getCategories, getListedStores, searchProducts } from "@/lib/api";
import { primaryImage } from "@/lib/product-utils";
import { normalize } from "@/lib/search";

export interface SearchSuggestions {
  products: { slug: string; name: string; price: number; image?: string; icon: string }[];
  categories: { slug: string; name: string; icon: string }[];
  stores: { slug: string; name: string }[];
  correctedQuery?: string;
}

export async function searchSuggestions(query: string): Promise<SearchSuggestions> {
  const q = String(query ?? "").slice(0, 80).trim();
  if (q.length < 2) return { products: [], categories: [], stores: [] };

  const [result, categories, stores] = await Promise.all([searchProducts(q), getCategories(), getListedStores()]);
  const needle = normalize(q);
  const nameMatches = (name: string) => normalize(name).split(" ").some((w) => w.startsWith(needle) || needle.startsWith(w) && w.length >= 3);

  return {
    products: (result.partial ? [] : result.products).slice(0, 6).map((p) => ({
      slug: p.slug,
      name: p.name,
      price: p.price,
      image: primaryImage(p),
      icon: p.icon,
    })),
    categories: categories
      .filter((c) => !c.hidden && c.slug !== "needs-category" && nameMatches(c.name))
      .slice(0, 3)
      .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon })),
    stores: stores.filter((s) => nameMatches(s.name)).slice(0, 2).map((s) => ({ slug: s.slug, name: s.name })),
    correctedQuery: result.correctedQuery,
  };
}

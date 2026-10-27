import type { Metadata } from "next";
import Link from "next/link";
import RecoStack from "@/components/reco/RecoStack";
import TrackSearch from "@/components/reco/TrackSearch";
import ShopClient from "@/components/shop/ShopClient";
import { buildFacets } from "@/lib/taxonomy-attributes";
import {
  getCategories,
  getListedStores,
  getProductsByStore,
  getStore,
  searchProducts,
} from "@/lib/api";

// Results pages are endless variations of the catalogue: crawl through
// them to the products, but don't list them.
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; store?: string }>;
}) {
  const { q = "", store: storeSlug } = await searchParams;

  /*
   * ── `?store=` scopes the search to one shop ──────────────────────────
   * Sent by the search box on a store's own website (see
   * StoreSiteHeader). A shopper who typed a bakery's address and searched
   * "cake" is asking that bakery, not the whole mall — returning eleven
   * other shops' cakes would be a strange answer and a good way to lose
   * the sale to a competitor the seller never invited.
   *
   * Scoped search reads the store's OWN catalogue, so it still works for a
   * shop that has opted out of the marketplace.
   */
  const scopedStore = storeSlug ? await getStore(storeSlug) : undefined;

  const [search, stores, categories] = await Promise.all([
    scopedStore ? searchWithinStore(scopedStore.slug, q) : searchProducts(q),
    getListedStores(),
    getCategories(true),
  ]);
  const results = search.products;
  const searchHref = (term: string) =>
    `/search?q=${encodeURIComponent(term)}${scopedStore ? `&store=${scopedStore.slug}` : ""}`;
  // Departments to offer when nothing was found — somewhere to go next.
  const departments = categories.filter((c) => !c.parentSlug && !c.hidden && c.slug !== "needs-category").slice(0, 8);

  const where = scopedStore ? ` in ${scopedStore.name}` : "";

  return (
    <>
      <TrackSearch query={q} resultCount={results.length} />
      {q && (search.correctedQuery || search.partial || results.length === 0) && (
        <div className="mx-auto max-w-7xl px-4 pt-6">
          {search.correctedQuery && results.length > 0 && (
            <p className="rounded-2xl bg-ocean-50 px-4 py-3 text-sm text-ocean-900">
              Showing results for <strong>{search.correctedQuery}</strong>.{" "}
              <span className="text-slate-500">No exact match for &ldquo;{q}&rdquo;.</span>
            </p>
          )}
          {search.partial && (
            <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nothing matched every word, so these are the closest matches.
            </p>
          )}
          {results.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-4xl">🔍</p>
              <h1 className="mt-2 font-display text-lg font-bold text-ocean-950">
                Nothing found for &ldquo;{q}&rdquo;{where}
              </h1>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Try fewer or more general words — &ldquo;dress&rdquo; rather than &ldquo;red silk evening
                dress&rdquo; — or browse a department.
              </p>
              {!scopedStore && departments.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {departments.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/category/${c.slug}`}
                      className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-ocean-400"
                    >
                      {c.icon} {c.name}
                    </Link>
                  ))}
                </div>
              )}
              {q.trim().includes(" ") && (
                <p className="mt-4 text-sm">
                  <Link href={searchHref(q.trim().split(/\s+/)[0])} className="font-semibold text-ocean-700 underline">
                    Search for &ldquo;{q.trim().split(/\s+/)[0]}&rdquo; instead
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {/* The empty grid would add a second "no products" box under the card above. */}
      {(results.length > 0 || !q) && (
        <ShopClient
          products={results}
          facets={buildFacets(results)}
          personalize
          stores={stores}
          categories={categories}
          title={q ? `Results for “${q}”${where}` : `Search${where}`}
          subtitle={
            q
              ? `${results.length} product${results.length === 1 ? "" : "s"} found`
              : "Type something in the search bar above to get started"
          }
        />
      )}
      {/*
        A search that found nothing is the moment a marketplace usually
        loses someone. Their own history is the best thing to offer instead
        of an empty page — but not on a shop's own site, where suggesting
        other people's products is the one thing it must not do.
      */}
      {results.length === 0 && !scopedStore && (
        <RecoStack surface="home" only={["continue", "for-you", "rising", "loved"]} max={2} />
      )}
    </>
  );
}

/** The same search, within one shop's own shelves; an empty query lists them all. */
async function searchWithinStore(slug: string, query: string) {
  const products = await getProductsByStore(slug);
  if (!query.trim()) return { products, partial: false };
  return searchProducts(query, products);
}

import type { Metadata } from "next";
import RecoStack from "@/components/reco/RecoStack";
import TrackSearch from "@/components/reco/TrackSearch";
import ShopClient from "@/components/shop/ShopClient";
import {
  getCategories,
  getListedStores,
  getProductsByStore,
  getStore,
  searchProducts,
} from "@/lib/api";

export const metadata: Metadata = { title: "Search" };

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

  const [results, stores, categories] = await Promise.all([
    scopedStore ? searchWithinStore(scopedStore.slug, q) : searchProducts(q),
    getListedStores(),
    getCategories(true),
  ]);

  const where = scopedStore ? ` in ${scopedStore.name}` : "";

  return (
    <>
      <TrackSearch query={q} resultCount={results.length} />
      <ShopClient
        products={results}
        stores={stores}
        categories={categories}
        title={q ? `Results for “${q}”${where}` : `Search${where}`}
        subtitle={
          q
            ? `${results.length} product${results.length === 1 ? "" : "s"} found`
            : "Type something in the search bar above to get started"
        }
      />
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

/** Name / description / code match, within one shop's shelves. */
async function searchWithinStore(slug: string, query: string) {
  const products = await getProductsByStore(slug);
  const q = query.trim().toLowerCase();
  if (!q) return products;

  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q) ||
      product.subcategory?.toLowerCase().includes(q) ||
      product.internalReference?.toLowerCase().includes(q) ||
      product.barcode?.toLowerCase().includes(q),
  );
}

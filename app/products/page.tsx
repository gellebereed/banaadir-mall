import type { Metadata } from "next";
import ShopClient from "@/components/shop/ShopClient";
import { buildFacets } from "@/lib/taxonomy-attributes";
import { getCategories, getListedStores, getMarketplaceProducts } from "@/lib/api";

export const metadata: Metadata = { title: "All Products" };

/** Full catalog. Supports ?sort=sold|discount|new|... via the footer/home links. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; max?: string }>;
}) {
  const { sort, max } = await searchParams;
  // ?max=10 — "Under $10" from the home page's budget rows.
  const maxPrice = Number(max);
  const [products, stores, categories] = await Promise.all([
    // Browsing the whole catalogue is a discovery surface, so stores that
    // opted out of the marketplace are not part of it.
    getMarketplaceProducts(),
    getListedStores(),
    getCategories(true),
  ]);

  return (
    <ShopClient
      products={products}
      facets={buildFacets(products)}
      stores={stores}
      categories={categories}
      title="All Products"
      subtitle="Everything on Banaadir Mall, from every store"
      initialSort={sort ?? "featured"}
      initialMaxPrice={Number.isFinite(maxPrice) && maxPrice > 0 ? Math.min(maxPrice, 100_000) : undefined}
    />
  );
}

import type { Metadata } from "next";
import ShopClient from "@/components/shop/ShopClient";
import { getCategories, getStores, searchProducts } from "@/lib/api";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [results, stores, categories] = await Promise.all([
    searchProducts(q),
    getStores(),
    getCategories(true),
  ]);

  return (
    <ShopClient
      products={results}
      stores={stores}
      categories={categories}
      title={q ? `Results for “${q}”` : "Search"}
      subtitle={
        q
          ? `${results.length} product${results.length === 1 ? "" : "s"} found`
          : "Type something in the search bar above to get started"
      }
    />
  );
}

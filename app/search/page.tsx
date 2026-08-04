import type { Metadata } from "next";
import RecoStack from "@/components/reco/RecoStack";
import TrackSearch from "@/components/reco/TrackSearch";
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
    <>
      <TrackSearch query={q} resultCount={results.length} />
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
      {/*
        A search that found nothing is the moment a marketplace usually
        loses someone. Their own history is the best thing to offer instead
        of an empty page.
      */}
      {results.length === 0 && (
        <RecoStack surface="home" only={["continue", "for-you", "rising", "loved"]} max={2} />
      )}
    </>
  );
}

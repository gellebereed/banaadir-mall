import type { Metadata } from "next";
import ShopClient from "@/components/shop/ShopClient";
import { getCategories, getProducts, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "All Products" };

/** Full catalog. Supports ?sort=sold|discount|new|... via the footer/home links. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const [products, stores, categories] = await Promise.all([
    getProducts(),
    getStores(),
    getCategories(true),
  ]);

  return (
    <ShopClient
      products={products}
      stores={stores}
      categories={categories}
      title="All Products"
      subtitle="Everything on Banaadir Mall, from every store"
      initialSort={sort ?? "featured"}
    />
  );
}

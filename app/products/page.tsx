import type { Metadata } from "next";
import ShopClient from "@/components/shop/ShopClient";
import { getProducts, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "All Products" };

/** Full catalog. Supports ?sort=sold|discount|new|... via the footer/home links. */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const [products, stores] = await Promise.all([getProducts(), getStores()]);

  return (
    <ShopClient
      products={products}
      stores={stores}
      title="All Products"
      subtitle="Everything on Banaadir Mall, from every store"
      initialSort={sort ?? "featured"}
    />
  );
}

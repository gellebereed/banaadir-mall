import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopClient from "@/components/shop/ShopClient";
import { getCategory, getProductsByCategory, getStores } from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

// Rendered per request so runtime product edits show immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  return { title: category?.name ?? "Category" };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  const [products, stores] = await Promise.all([getProductsByCategory(slug), getStores()]);

  return (
    <ShopClient
      products={products}
      stores={stores}
      title={`${category.icon} ${category.name}`}
      subtitle={category.tagline}
      showCategoryFilter={false}
    />
  );
}

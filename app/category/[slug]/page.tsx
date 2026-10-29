import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopClient from "@/components/shop/ShopClient";
import { breadcrumbLd, jsonLd, metaDescription, openGraph } from "@/lib/seo";
import { siteOrigin } from "@/lib/request-origin";
import { buildFacets } from "@/lib/taxonomy-attributes";
import { getCategories, getCategory, getProductsByCategory, getListedStores } from "@/lib/api";

interface Props {
  params: Promise<{ slug: string }>;
}

// Rendered per request so runtime product edits show immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategory((await params).slug);
  if (!category) notFound();
  const description = metaDescription(
    category.tagline,
    `Shop ${category.name} from trusted Somali stores on Banaadir Mall.`,
  );
  return {
    title: category.name,
    description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: await openGraph({ title: `${category.name} · Banaadir Mall`, description, url: `/category/${category.slug}` }),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  const [products, stores, categories] = await Promise.all([
    getProductsByCategory(slug),
    getListedStores(),
    getCategories(true),
  ]);

  /**
   * A department page shows the categories beneath it, so the sub-category
   * filter stays available. Without this, landing on "Men's Fashion" — which
   * now has thirteen categories under it — offered no way to narrow down.
   */
  const children = categories.filter((c) => c.parentSlug === slug && !c.hidden);

  // Home › department › this category, for the trail Google shows.
  const parent = category.parentSlug ? categories.find((c) => c.slug === category.parentSlug) : undefined;
  const trailLd = breadcrumbLd(await siteOrigin(), [
    { name: "Home", path: "/" },
    ...(parent ? [{ name: parent.name, path: `/category/${parent.slug}` }] : []),
    { name: category.name, path: `/category/${category.slug}` },
  ]);

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(trailLd)} />
    <ShopClient
      products={products}
      facets={buildFacets(products)}
      stores={stores}
      categories={categories}
      title={`${category.icon} ${category.name}`}
      subtitle={category.tagline}
      // Roots aggregate their children's products, so the category cut is
      // meaningful here; a leaf category has only itself and it is not.
      showCategoryFilter={children.length > 0}
    />
    </>
  );
}

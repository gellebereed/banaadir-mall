import type { MetadataRoute } from "next";
import { getCategories, getListedStores, getMarketplaceProducts } from "@/lib/api";
import { HOLDING_SLUG } from "@/lib/category-holding";
import { requestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * Every page worth finding: the visible catalogue, its categories and the
 * stores listed on the marketplace. Built per request from the same reads
 * the shop uses, so a hidden product or an unlisted store drops out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, products, categories, stores] = await Promise.all([
    requestOrigin(),
    getMarketplaceProducts(),
    getCategories(),
    getListedStores(),
  ]);
  return [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/products`, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/stores`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${origin}/flash`, changeFrequency: "daily", priority: 0.6 },
    ...categories
      .filter((c) => c.slug !== HOLDING_SLUG && !c.hidden)
      .map((c) => ({ url: `${origin}/category/${c.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...stores.map((s) => ({ url: `${origin}/store/${s.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({
      url: `${origin}/product/${p.slug}`,
      ...(p.updatedAt ? { lastModified: p.updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}

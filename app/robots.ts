import type { MetadataRoute } from "next";
import { isIndexableDeploy, siteOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/** Shop pages are for search engines; dashboards, accounts and checkout are not. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // A deploy preview is a copy of the shop: keep it out of search entirely.
  if (!isIndexableDeploy()) return { rules: { userAgent: "*", disallow: "/" } };
  const origin = await siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/vendor", "/api", "/account", "/checkout", "/cart", "/invite", "/reset-password"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

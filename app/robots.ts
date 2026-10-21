import type { MetadataRoute } from "next";
import { requestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/** Shop pages are for search engines; dashboards, accounts and checkout are not. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await requestOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/vendor", "/api", "/account", "/checkout", "/cart", "/invite", "/reset-password"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}

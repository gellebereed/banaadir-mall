/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEO & LINK PREVIEWS — shared bits for page metadata.
 * ─────────────────────────────────────────────────────────────────────────
 * Next.js merges `openGraph` SHALLOWLY: a page that sets its own openGraph
 * object replaces the root layout's, siteName and all. Pages build theirs
 * through `openGraph()` so the shared fields always come along.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";

export const SITE_NAME = "Banaadir Mall";

/** The marketplace's social accounts (tracking parameters stripped). */
export const SOCIAL_PROFILES = [
  "https://www.instagram.com/banaadirmall",
  "https://www.tiktok.com/@banaadir__mall",
  "https://www.facebook.com/BanaadirMall",
];

/** "Instagram", "TikTok", "Facebook" — a profile's label, from its address. */
export function socialName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("tiktok")) return "TikTok";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("facebook")) return "Facebook";
  return host;
}

type OpenGraph = NonNullable<Metadata["openGraph"]>;

export function openGraph(fields: { title: string; description?: string; url?: string; images?: OpenGraph["images"] }): OpenGraph {
  return {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    // Setting openGraph on a page also drops the root's file-based image,
    // so the site card is named explicitly unless the page has its own.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Banaadir Mall" }],
    ...fields,
  };
}

/** Description text: one line, no markdown markers, at most ~160 characters. */
export function metaDescription(text: string | undefined, fallback = ""): string {
  const clean = (text ?? "")
    .replace(/[*_#>`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const source = clean || fallback;
  return source.length > 160 ? `${source.slice(0, 157).replace(/\s+\S*$/, "")}…` : source;
}

/**
 * schema.org JSON-LD for a <script type="application/ld+json">. `<` is
 * escaped so a product description can never close the script tag.
 */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/*
 * ── Structured data ─────────────────────────────────────────────────────
 * What Google reads to show the shop as a brand rather than a bare link:
 * the name and logo beside the result, a search box under it, and the
 * "Home › Fashion › …" trail in place of the raw URL.
 */

/** The marketplace itself — on the home page. */
export function organizationLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${origin}/#organization`,
    name: SITE_NAME,
    url: `${origin}/`,
    logo: `${origin}/icons/icon-512.png`,
    image: `${origin}/social/banaadir-mall.jpg`,
    description:
      "Somalia's online marketplace — trusted local stores, delivered. Pay with EVC Plus, Zaad, eDahab or cash on delivery.",
    areaServed: { "@type": "Country", name: "Somalia" },
    // The brand's own profiles, so search engines tie them to the site.
    sameAs: SOCIAL_PROFILES,
    ...(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            telephone: `+${process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP.replace(/\D/g, "")}`,
            availableLanguage: ["English", "Somali"],
          },
        }
      : {}),
  };
}

/** The site, with the search box Google may show under the result. */
export function websiteLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: SITE_NAME,
    alternateName: ["Banaadir", "BanaadirMall"],
    url: `${origin}/`,
    inLanguage: ["en", "so"],
    publisher: { "@id": `${origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The trail above a page, as paths from the site root (the last one is the page itself). */
export function breadcrumbLd(origin: string, trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: `${origin}${step.path}`,
    })),
  };
}

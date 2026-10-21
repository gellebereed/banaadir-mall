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

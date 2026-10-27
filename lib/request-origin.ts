import { headers } from "next/headers";

/**
 * This site's origin as the visitor reached it — for links that must come
 * back here (password reset, email confirmation). Behind Netlify the real
 * host arrives in x-forwarded-host.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/*
 * ── The ONE address search engines should know ─────────────────────────
 * The same deploy answers on the custom domain and on *.netlify.app, and
 * every deploy preview has an address of its own. Canonical links, the
 * sitemap and structured data built from requestOrigin() named whichever
 * of those the crawler happened to arrive on — the same page under
 * several addresses, each claiming to be the original.
 *
 * So they use the production address: NEXT_PUBLIC_SITE_URL when it is
 * set, else the primary domain Netlify reports to a production build
 * (next.config.ts), else — locally, and on previews — the request's own.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.BM_SITE_URL;
  return configured ? configured.replace(/\/+$/, "") : requestOrigin();
}

/**
 * Whether search engines may index this deploy: production, or anywhere
 * that isn't Netlify. Deploy previews and branch deploys are copies of the
 * shop that must never show up in Google next to the real one.
 */
export function isIndexableDeploy(): boolean {
  const context = process.env.BM_DEPLOY_CONTEXT;
  return !context || context === "production";
}

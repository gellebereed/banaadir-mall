/**
 * The shop's public address for links that leave the site — the picking
 * slip in a seller's WhatsApp order message, in particular.
 *
 * ── Why not window.location.origin ───────────────────────────────────────
 * The same deploy also answers on banaadir-mall.netlify.app. A customer
 * who reached the shop through that address sent the seller a slip link on
 * the Netlify domain, which looks like a phishing link next to an order
 * from "Banaadir Mall". Links a seller or customer will see always name
 * the real domain.
 *
 * NEXT_PUBLIC_SITE_URL wins when set; otherwise the production domain
 * Netlify reports (next.config.ts → BM_SITE_URL), unless that is itself a
 * *.netlify.app address; otherwise www.banaadirmall.com (the bare
 * banaadirmall.com does not reach this site — it answered 404 in Nov 2026).
 */
const FALLBACK = "https://www.banaadirmall.com";

function pick(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || process.env.BM_SITE_URL || "").replace(/\/+$/, "");
  // The bare domain doesn't reach the shop (see above): name www instead.
  if (/^https?:\/\/banaadirmall\.com$/i.test(configured)) return FALLBACK;
  if (configured && !/\.netlify\.app$/i.test(configured)) return configured;
  return FALLBACK;
}

export const PUBLIC_SITE_URL = pick();

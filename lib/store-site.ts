/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STORE WEBSITES — a shop's own address on top of the marketplace.
 * ─────────────────────────────────────────────────────────────────────────
 *   sahra-fashion.banaadirmall.com  →  the Sahra Fashion shop, on its own
 *
 * ── What this is, and what it is not ─────────────────────────────────────
 * It is a THEME and an ADDRESS, not a second application. The same product
 * pages, the same basket, the same checkout, the same orders and the same
 * commission — a seller gets a link that is theirs and a shopfront that
 * looks like theirs, and the marketplace keeps the machinery.
 *
 * That is the arrangement that works for both sides. A site builder would
 * give sellers something to maintain and the marketplace nothing; a plain
 * `/store/x` link gives the marketplace everything and the seller no reason
 * to send anybody to it.
 *
 * Safe to import from middleware — no Node APIs, no database.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * The apex the subdomains hang off.
 *
 * Configurable because it is different in every environment, and hard-coding
 * it is how a feature works in production and is untestable everywhere else.
 */
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "banaadirmall.com"
).toLowerCase();

/**
 * Subdomains that belong to the marketplace and can never be a shop.
 *
 * `www` is the obvious one. The rest are reserved before somebody registers
 * a store called "admin" and takes the control panel's address with them —
 * which is not a hypothetical, it is the first thing anyone tries.
 */
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "vendor",
  "account",
  "cdn",
  "static",
  "assets",
  "mail",
  "smtp",
  "ftp",
  "dev",
  "staging",
  "preview",
  "test",
  "store",
  "stores",
  "shop",
  "help",
  "support",
  "blog",
  "docs",
  "status",
]);

/** Slugs a store may not claim, because the address is already spoken for. */
export function isReservedSubdomain(slug: string): boolean {
  return RESERVED.has(slug.trim().toLowerCase());
}

/**
 * The store a hostname refers to, or null for the marketplace itself.
 *
 * ── Why localhost is handled here too ────────────────────────────────────
 * `sahra.localhost:3000` resolves in every modern browser without touching
 * a hosts file, so the whole feature can be developed and demonstrated
 * locally. A subdomain feature that can only be seen in production is one
 * nobody can safely change.
 */
export function storeSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;

  // Strip the port, lowercase, drop a trailing dot.
  const clean = host.split(":")[0].trim().toLowerCase().replace(/\.$/, "");
  if (!clean) return null;

  // Local development: <slug>.localhost
  if (clean.endsWith(".localhost")) {
    const slug = clean.slice(0, -".localhost".length);
    return validSlug(slug) ? slug : null;
  }

  // A bare IP or a single label ("localhost") is never a store.
  if (!clean.includes(".") || /^[\d.]+$/.test(clean)) return null;

  if (clean === ROOT_DOMAIN || !clean.endsWith(`.${ROOT_DOMAIN}`)) {
    /*
     * Not our apex. On a preview deployment the host is something like
     * project-abc123.vercel.app, and treating "project-abc123" as a store
     * slug would take the whole preview down. Anything unrecognised is the
     * marketplace.
     */
    return null;
  }

  const slug = clean.slice(0, -(ROOT_DOMAIN.length + 1));
  // Only ONE label deep. "a.b.banaadirmall.com" is not a shop.
  if (slug.includes(".")) return null;

  return validSlug(slug) ? slug : null;
}

function validSlug(slug: string): boolean {
  if (!slug || isReservedSubdomain(slug)) return false;
  /*
   * A DNS label: 1–63 characters, alphanumeric at both ends, hyphens
   * allowed in between.
   *
   * The middle group is OPTIONAL, which is the whole point — written as
   * `[a-z0-9][a-z0-9-]{0,61}[a-z0-9]` it silently requires two characters,
   * so a one-letter store slug parses as "not a store" and its owner gets
   * the marketplace home page at their own address.
   */
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

/** The public address of a store's own site. */
export function storeSiteUrl(slug: string, protocol = "https"): string {
  return `${protocol}://${slug}.${ROOT_DOMAIN}`;
}

/** The header middleware stamps on a request that arrived on a store host. */
export const STORE_SITE_HEADER = "x-bm-store-site";

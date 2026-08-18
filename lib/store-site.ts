/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STORE WEBSITES — a shop's own shopfront, on a path.
 * ─────────────────────────────────────────────────────────────────────────
 *   banaadirmall.com/store/sahra-fashion  →  Sahra Fashion, on its own
 *
 * ── Why a path and not a subdomain ───────────────────────────────────────
 * A subdomain (sahra.banaadirmall.com) is the prettier address and it needs
 * a wildcard DNS record, a wildcard TLS certificate and a deployment that
 * routes on Host. That is real infrastructure to stand up before a single
 * seller can use the feature. The path works today, on every environment,
 * with nothing to configure — so the feature ships now and the address can
 * get prettier later without any of this changing.
 *
 * What a seller actually gets is unchanged either way: their branding, their
 * name, their products, no marketplace menu, and a link they can share.
 *
 * ── The marketplace decides who gets one ─────────────────────────────────
 * Store.ownSite is an ADMIN switch, not a seller one. A branded shopfront
 * with no marketplace navigation is something a marketplace grants — to a
 * brand it has signed, a seller on a higher plan, a shop that has earned
 * it — and letting every new registration turn one on would empty the mall
 * of the traffic that makes it worth joining.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * The apex, used only to build shareable links for display.
 *
 * No routing depends on it any more; it exists so the "here is your link"
 * panel can show a seller a complete address rather than a bare path.
 */
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "banaadirmall.com"
).toLowerCase();

/** The path a store's own shopfront lives at. */
export function storeSitePath(slug: string): string {
  return `/store/${slug}`;
}

/** The full address a seller shares. */
export function storeSiteUrl(slug: string, protocol = "https"): string {
  return `${protocol}://${ROOT_DOMAIN}${storeSitePath(slug)}`;
}

/**
 * The header middleware stamps with the current path.
 *
 * The root layout has no other way to know which page it is wrapping, and
 * it needs to: a store with its own site gets different chrome on
 * /store/<slug> than the marketplace shows anywhere else.
 */
export const PATHNAME_HEADER = "x-bm-pathname";

/** The store slug a marketplace path refers to, or null. */
export function storeSlugFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = /^\/store\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(pathname.split("?")[0]);
  return match ? match[1].toLowerCase() : null;
}

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROOT_DOMAIN, STORE_SITE_HEADER, storeSlugFromHost } from "@/lib/store-site";

const SESSION_COOKIE = "bm_session";

interface SessionShape {
  email?: string;
  role?: "admin" | "seller" | "customer";
}

function readSession(request: NextRequest): SessionShape | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      const parsed = JSON.parse(candidate) as SessionShape;
      if (parsed?.email && parsed?.role) return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  // First, update Supabase session cookies if configured
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;
  const session = readSession(request);

  /*
   * ── Store websites ───────────────────────────────────────────────────
   * sahra-fashion.banaadirmall.com is Sahra Fashion's own shopfront. It is
   * the SAME application — same basket, same checkout, same orders — wearing
   * the shop's branding instead of the marketplace's. See lib/store-site.ts.
   *
   * Only the root is rewritten. Every other path (a product, the basket,
   * checkout) already works unchanged, and rewriting them would break the
   * URLs shoppers copy out of the address bar. The header below is what
   * tells the layout to wear the shop's clothes on all of them.
   */
  const storeSlug = storeSlugFromHost(request.headers.get("host"));
  if (storeSlug) {
    const headers = new Headers(request.headers);
    headers.set(STORE_SITE_HEADER, storeSlug);

    /*
     * The dashboards belong to the marketplace, not to the shop. Somebody
     * who lands on one from a store address is moved to the marketplace
     * host, so a seller never manages their shop from a URL their own
     * customers use — and never has a session cookie set on the wrong host.
     *
     * The destination is this host with the store label REMOVED, rather
     * than the configured production domain. Hard-coding ROOT_DOMAIN sends
     * anyone developing on elite-kitchen.localhost:3000 to a domain that
     * does not exist on their machine.
     */
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/vendor") ||
      pathname.startsWith("/account")
    ) {
      const host = request.headers.get("host") ?? "";
      const [hostname, port] = host.split(":");
      const parent = hostname.split(".").slice(1).join(".") || ROOT_DOMAIN;

      const url = request.nextUrl.clone();
      url.host = parent;
      url.port = port ?? "";
      return NextResponse.redirect(url);
    }

    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/store/${storeSlug}`;
      return NextResponse.rewrite(url, { request: { headers } });
    }

    return NextResponse.next({ request: { headers } });
  }

  // Admin control panel — administrators only.
  if (pathname.startsWith("/admin")) {
    if (session?.role !== "admin") return redirectTo(request, "/login");
    return response;
  }

  // Seller dashboard — sellers (own store) and admins.
  if (pathname.startsWith("/vendor")) {
    if (!session) return redirectTo(request, "/login");
    if (session.role === "customer") return redirectTo(request, "/sell");
    return response;
  }

  // Customer account area — any signed-in user.
  if (pathname.startsWith("/account")) {
    if (!session) return redirectTo(request, "/login");
  }

  return response;
}

export const config = {
  /*
   * Everything except Next's own assets and static files.
   *
   * It used to cover only the three guarded areas, which is all the auth
   * checks need — but a store website has to be recognised on EVERY
   * request, including the home page, or the shop's branding appears on
   * some pages and not others. The excluded prefixes keep the middleware
   * off the hot path for images, fonts and the build output.
   */
  matcher: [
    "/((?!_next/static|_next/image|api/uploads|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|woff2?)$).*)",
  ],
};

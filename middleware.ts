import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import type { Session } from "@/lib/auth";
import { verifySession } from "@/lib/session-token";
import { PATHNAME_HEADER, storeSlugFromPath } from "@/lib/store-site";

const SESSION_COOKIE = "bm_session";

/**
 * The session, only if its signature checks out — see lib/session-token.ts.
 * An edited cookie reads as signed out, so it is sent to /login.
 */
function readSession(request: NextRequest): Promise<Session | null> {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
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
  const session = await readSession(request);

  /*
   * ── Which page is this? ──────────────────────────────────────────────
   * The root layout wraps every page and is given no way to find out which
   * one, so the path is stamped on the request for it to read. It needs it
   * for exactly one decision: a store the marketplace has granted its own
   * shopfront gets the shop's branding on /store/<slug> instead of the
   * marketplace header. See lib/store-site.ts.
   *
   * ── Only there, and nowhere else ─────────────────────────────────────
   * Stamping a header means `NextResponse.next({ request: { headers } })`,
   * which REPLACES the request headers for the render — the Cookie header
   * included, frozen as it was when the request arrived. This used to run
   * on every route, /login among them, and signing in is a server action
   * on /login that sets the session cookie and redirects. The redirect
   * target was then rendered from the frozen, pre-login cookies, so the
   * root layout (and the header with it) came back as a signed-out
   * customer, and because layouts survive client navigation it stayed
   * that way until a full reload. Admins and sellers "logged in as a
   * normal user". So the override is applied on /store/<slug> only, and
   * every other request passes straight through.
   */
  const proceed = () => {
    if (!storeSlugFromPath(pathname)) return response;

    const withPath = new Headers(request.headers);
    withPath.set(PATHNAME_HEADER, pathname);
    /**
     * `updateSession` returns its own NextResponse with rotated Supabase
     * auth cookies on it. A fresh `NextResponse.next()` — the only way to
     * attach modified request headers — would throw those away, signing
     * people out quietly when their token expires. So they are copied.
     */
    const next = NextResponse.next({ request: { headers: withPath } });
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    return next;
  };

  // Admin control panel — administrators only.
  if (pathname.startsWith("/admin")) {
    if (session?.role !== "admin") return redirectTo(request, "/login");
    return proceed();
  }

  // Seller dashboard — sellers (own store) and admins.
  if (pathname.startsWith("/vendor")) {
    if (!session) return redirectTo(request, "/login");
    if (session.role === "customer") return redirectTo(request, "/sell");
    return proceed();
  }

  // Customer account area — any signed-in user.
  if (pathname.startsWith("/account")) {
    if (!session) return redirectTo(request, "/login");
  }

  return proceed();
}

export const config = {
  /*
   * The three guarded areas, plus the store pages whose layout needs the
   * path header. Keeping it off everything else — /login in particular —
   * is what keeps sign-in's freshly set session cookie visible to the page
   * it redirects to. See `proceed` above.
   */
  matcher: ["/admin/:path*", "/vendor/:path*", "/account/:path*", "/store/:path*"],
};

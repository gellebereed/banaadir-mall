import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { PATHNAME_HEADER } from "@/lib/store-site";

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
   * ── Which page is this? ──────────────────────────────────────────────
   * The root layout wraps every page and is given no way to find out which
   * one, so the path is stamped on the request for it to read. It needs it
   * for exactly one decision: a store the marketplace has granted its own
   * shopfront gets the shop's branding on /store/<slug> instead of the
   * marketplace header. See lib/store-site.ts.
   */
  const withPath = new Headers(request.headers);
  withPath.set(PATHNAME_HEADER, pathname);

  /**
   * Continue, carrying BOTH the path header and whatever cookies
   * updateSession refreshed.
   *
   * `updateSession` returns its own NextResponse with rotated Supabase auth
   * cookies on it. Returning a fresh `NextResponse.next()` instead — which
   * is the only way to attach modified request headers — throws those
   * cookies away, and the symptom is users being quietly signed out when
   * their token expires. So the cookies are copied across.
   */
  const proceed = () => {
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
   * Everything except Next's own assets and static files.
   *
   * It used to cover only the three guarded areas, which is all the auth
   * checks need — but the layout reads the current path from a header
   * stamped here, so it has to run on every page that renders chrome. The
   * excluded prefixes keep it off the hot path for images, fonts and the
   * build output.
   */
  matcher: [
    "/((?!_next/static|_next/image|api/uploads|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|woff2?)$).*)",
  ],
};

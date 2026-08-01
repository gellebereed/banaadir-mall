import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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
  matcher: ["/admin/:path*", "/vendor/:path*", "/account/:path*"],
};

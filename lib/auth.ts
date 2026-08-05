/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DEMO AUTHENTICATION — for end-to-end testing only.
 * ─────────────────────────────────────────────────────────────────────────
 * Sessions are stored in a plain (non-httpOnly) cookie so both client
 * components and server components can read them. Passwords live in this
 * file in plain text. That is fine for a demo and completely unacceptable
 * for production — replace with real auth (NextAuth.js, Clerk, or Odoo
 * portal users) before going live. The rest of the app only depends on
 * the `Session` shape, so swapping the mechanism is contained.
 *
 * Accounts:
 *   Admin:     ADMIN_EMAIL env var, else ahgbered10@gmail.com / Admin@2026
 *   Sellers:   <store-slug>@seller.banaadirmall.com / Seller@2026
 *              generated from the active stores, so a store added through
 *              the dashboard gets a login without any code change.
 *   Customer:  ayaan@banaadirmall.com            / Customer@2026
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EmployeeRole } from "./types";

export interface Session {
  name: string;
  email: string;
  role: "admin" | "seller" | "customer";
  /** Store slug — only present for sellers. */
  store?: string;
  /**
   * Access level for employee accounts. Absent for owner/admin logins,
   * which have full access. See can() below.
   */
  access?: EmployeeRole;
}

interface DemoUser extends Session {
  password: string;
}

export const SESSION_COOKIE = "bm_session";

/**
 * Owner logins are `<store-slug>@seller.banaadirmall.com`.
 *
 * These used to be generated from the BUNDLED seed stores, which meant two
 * things went wrong the moment a marketplace stopped being a demo: deleted
 * demo brands kept a working owner login forever, and a real store added
 * through the dashboard had none. The slug is now resolved against the live
 * store list at sign-in — see parseSellerEmail and its use in
 * app/auth-actions.ts.
 */
export const SELLER_EMAIL_SUFFIX = "@seller.banaadirmall.com";
export const SELLER_PASSWORD = process.env.SELLER_PASSWORD || "Seller@2026";

/** The store slug an owner login refers to, or null if it isn't one. */
export function parseSellerEmail(email: string): string | null {
  const clean = email.trim().toLowerCase();
  if (!clean.endsWith(SELLER_EMAIL_SUFFIX)) return null;
  const slug = clean.slice(0, -SELLER_EMAIL_SUFFIX.length);
  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/**
 * The marketplace owner's account.
 *
 * Overridable with ADMIN_EMAIL / ADMIN_PASSWORD so the credentials can be
 * rotated in the hosting environment without a code change — which is the
 * least this deserves while the passwords still live in a file. Set both
 * before launch; the fallback below exists so a fresh clone still starts.
 */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "ahgbered10@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@2026";

export const DEMO_USERS: DemoUser[] = [
  {
    name: "Mall Administrator",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: "admin",
  },
  {
    // Matches the demo orders so the account page shows order history.
    name: "Ayaan Warsame",
    email: "ayaan@banaadirmall.com",
    password: "Customer@2026",
    role: "customer",
  },
];

/** Password for every employee account created from a Team page. */
export const EMPLOYEE_PASSWORD = "Employee@2026";

/** Validate against the built-in demo accounts (owners, admin, customer). */
export function matchDemoUser(email: string, password: string): Session | null {
  const user = DEMO_USERS.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
  );
  if (!user) return null;
  const { password: _omit, ...session } = user;
  return session;
}

/** Parse the raw cookie value back into a Session (null if invalid). */
export function parseSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      const data = JSON.parse(candidate) as Session;
      if (data && data.email && data.role) return data;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** What a session may manage. Owners, admins and managers can do everything. */
export type AccessArea = "products" | "orders" | "marketing" | "team";

export function can(session: Session, area: AccessArea): boolean {
  if (!session.access || session.access === "manager") return true;
  if (session.access === "viewer") return false;
  return session.access === area;
}

/** Human-readable description per employee role (shown on Team pages). */
export const ROLE_DESCRIPTIONS: Record<EmployeeRole, string> = {
  manager: "Full access — products, orders, promotions and team",
  products: "Manage products and promotions only",
  orders: "Manage and fulfil orders only",
  marketing: "Manage storefront marketing only (platform)",
  viewer: "View dashboards, cannot change anything",
};

/** Where each role lands after signing in. */
export function homeForRole(role: Session["role"]): string {
  return { admin: "/admin", seller: "/vendor", customer: "/account" }[role];
}

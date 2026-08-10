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

import type { Employee, EmployeeRole, Permission } from "./types";

export interface Session {
  name: string;
  email: string;
  role: "admin" | "seller" | "customer";
  /** Store slug — only present for sellers. The one being worked in now. */
  store?: string;
  /**
   * Every store this account may open, `store` included.
   *
   * ── Why a list ───────────────────────────────────────────────────────
   * One person works for more than one shop — a bookkeeper doing the
   * accounts for two brands in the same building is the ordinary case here,
   * not the exotic one. The session used to hold a single slug, so a second
   * invitation had nowhere to go: whichever employee row happened to be
   * read first decided which dashboard they landed in, and the other shop
   * was unreachable. Hence the switcher (components/dashboard/StoreSwitcher).
   *
   * Absent on owner and admin logins, and on cookies written before this
   * existed — both of which correctly mean "just `store`".
   *
   * PERMISSIONS ARE PER STORE and are not carried here. Switching re-reads
   * the employee row for the store being switched to; a manager at one shop
   * does not become a manager at the other.
   */
  stores?: string[];
  /**
   * Access level for employee accounts. Absent for owner/admin logins,
   * which have full access. See can() below.
   */
  access?: EmployeeRole;
  /**
   * The employee's exact grants, resolved at sign-in. Absent means the
   * role's defaults apply — which is also what an older cookie, written
   * before permissions existed, correctly falls back to.
   */
  permissions?: Permission[];
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

// ── Permissions ─────────────────────────────────────────────────────────
//
// The owner of a store has no `access` and no `permissions`: they own the
// place, so every check below short-circuits to true for them. Everything
// here is about the people they let in.

interface PermissionSpec {
  key: Permission;
  label: string;
  /** What granting it actually lets the person do. */
  hint: string;
  group: "Products" | "Orders" | "Storefront" | "Money" | "Store";
  /** Shown on store Team pages / on the platform Team page / on both. */
  scope: "store" | "platform" | "both";
}

/**
 * Every grant, in the order they are shown when assigning them.
 *
 * `costs.view` sits in its own group on purpose. It is the one permission
 * on this list that is not about breaking things — it is about a number
 * the person holding it can walk out of the building with, and it belongs
 * nowhere near a row of checkboxes about editing photos.
 */
export const PERMISSIONS: PermissionSpec[] = [
  {
    key: "products.view",
    label: "View products",
    hint: "See the product list, stock levels and selling prices.",
    group: "Products",
    scope: "both",
  },
  {
    key: "products.edit",
    label: "Add & edit products",
    hint: "Create products and change names, prices, stock and photos.",
    group: "Products",
    scope: "both",
  },
  {
    key: "products.import",
    label: "Import supplier files",
    hint: "Run the bulk importer, which can create hundreds of products at once.",
    group: "Products",
    scope: "store",
  },
  {
    key: "products.delete",
    label: "Delete products",
    hint: "Permanently remove products from the catalogue.",
    group: "Products",
    scope: "both",
  },
  {
    key: "orders.view",
    label: "View orders",
    hint: "See incoming orders and customer delivery details.",
    group: "Orders",
    scope: "both",
  },
  {
    key: "orders.manage",
    label: "Fulfil orders",
    hint: "Change order status, assign couriers and mark orders delivered.",
    group: "Orders",
    scope: "both",
  },
  {
    key: "promotions.manage",
    label: "Run promotions",
    hint: "Create discounts and apply for flash-deal campaigns.",
    group: "Storefront",
    scope: "store",
  },
  {
    key: "photos.manage",
    label: "Bulk photo upload",
    hint: "Match uploaded photos to products in bulk.",
    group: "Storefront",
    scope: "store",
  },
  {
    key: "marketing.manage",
    label: "Storefront marketing",
    hint: "Edit the home page, banners and announcements seen by every shopper.",
    group: "Storefront",
    scope: "platform",
  },
  {
    key: "costs.view",
    label: "See cost price & profit",
    hint: "Cost per unit, margin, and what the stock on hand is worth. Leave off for staff who only need selling prices.",
    group: "Money",
    scope: "both",
  },
  {
    key: "settings.manage",
    label: "Change store settings",
    hint: "Store name, logo, delivery charges and payment details.",
    group: "Store",
    scope: "store",
  },
  {
    key: "team.manage",
    label: "Manage the team",
    hint: "Invite people, change their access, and remove them. Grant carefully — it lets them grant themselves anything.",
    group: "Store",
    scope: "both",
  },
];

export const PERMISSION_KEYS: Permission[] = PERMISSIONS.map((p) => p.key);

export const PERMISSIONS_BY_KEY: Record<Permission, PermissionSpec> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p]),
) as Record<Permission, PermissionSpec>;

/** The permissions shown when assigning access in this context. */
export function permissionsForScope(store: string): PermissionSpec[] {
  const wanted = store === "platform" ? "platform" : "store";
  return PERMISSIONS.filter((p) => p.scope === "both" || p.scope === wanted);
}

/**
 * What each role grants out of the box.
 *
 * Note what is NOT in any of them: `costs.view`. A role called "products"
 * used to imply seeing cost price, because cost sat on the product page
 * and nothing distinguished the two. Now it is a deliberate act.
 */
export const ROLE_PERMISSIONS: Record<EmployeeRole, Permission[]> = {
  manager: [
    "products.view", "products.edit", "products.import", "products.delete",
    "orders.view", "orders.manage", "promotions.manage", "photos.manage",
    "marketing.manage", "settings.manage", "team.manage",
  ],
  products: [
    "products.view", "products.edit", "products.import",
    "promotions.manage", "photos.manage",
  ],
  orders: ["orders.view", "orders.manage", "products.view"],
  marketing: ["marketing.manage", "promotions.manage", "products.view"],
  viewer: ["products.view", "orders.view"],
};

/** The grants an employee actually holds — explicit ones, else the role's. */
export function permissionsFor(employee: Pick<Employee, "role" | "permissions">): Permission[] {
  const explicit = employee.permissions;
  if (explicit && explicit.length > 0) return explicit;
  // An empty array is a real answer ("this person may do nothing"), but an
  // empty array and an absent one are indistinguishable once a form has
  // round-tripped through FormData, so absent-or-empty both mean "role".
  return ROLE_PERMISSIONS[employee.role] ?? [];
}

/** Discard anything that is not a permission we know about. */
export function parsePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  const known = new Set<string>(PERMISSION_KEYS);
  return values.filter((v): v is Permission => typeof v === "string" && known.has(v));
}

/** May this session do this exact thing? Owners and admins always may. */
export function may(session: Session, permission: Permission): boolean {
  if (!session.access) return true;
  return permissionsFor({ role: session.access, permissions: session.permissions }).includes(
    permission,
  );
}

/** What a session may manage. Owners, admins and managers can do everything. */
export type AccessArea = "products" | "orders" | "marketing" | "team";

/**
 * The coarse check the pages and actions were written against, kept so a
 * finer model did not require touching every guard at once. Each area is
 * the permission that area's pages actually exercise.
 */
const AREA_PERMISSION: Record<AccessArea, Permission> = {
  products: "products.edit",
  orders: "orders.manage",
  marketing: "marketing.manage",
  team: "team.manage",
};

export function can(session: Session, area: AccessArea): boolean {
  return may(session, AREA_PERMISSION[area]);
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

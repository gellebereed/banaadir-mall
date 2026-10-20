/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ACCOUNTS — one email, one password, one role.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only.
 *
 * ── The problem this file exists to end ──────────────────────────────────
 * A password used to be checked against four unrelated places in turn —
 * Supabase Auth, the built-in admin, the shared store-owner password and
 * the shared employee password — and the ROLE came from whichever of them
 * matched. So one email could hold two passwords that led to two different
 * people: the marketplace owner typed one and got the control panel, typed
 * the other and got a shopper's account page. Sellers hit the same thing.
 *
 * Two rules replace that:
 *
 *   1. WHO you are comes from the email, never from the password.
 *      The admin email is the admin, a team row is staff, an owner login is
 *      that store's owner — whichever password let you in. (resolveSession)
 *
 *   2. An email has ONE password once it has a real account.
 *      Supabase Auth holds it. The old shared passwords (Admin@…, Seller@…,
 *      Employee@…) are accepted only for an email that has no Supabase
 *      account yet, and the first such sign-in creates that account with
 *      the password just used — after which only that account's password
 *      works, and the admin can change it from /admin/accounts.
 *
 * Rule 2 needs SUPABASE_SERVICE_ROLE_KEY: telling "no account" apart from
 * "wrong password" requires looking the user up, which the public key
 * cannot do. Without the key, sign-in still follows rule 1 — so the role
 * no longer depends on the password — but the shared passwords keep
 * working alongside the account's own. The accounts page says so.
 *
 * ── Roles never come from user_metadata ──────────────────────────────────
 * user_metadata is writable by the signed-in user themselves, straight
 * from the browser with the public key. Reading `role: "admin"` out of it
 * would let any customer promote themselves. The admin role is decided by
 * the admin email and the platform team only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { User } from "@supabase/supabase-js";
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  EMPLOYEE_PASSWORD,
  isAdminEmail,
  matchDemoUser,
  parseSellerEmail,
  SELLER_PASSWORD,
  SELLER_EMAIL_SUFFIX,
  type Session,
} from "./auth";
import { getAllEmployees, getAllStores, getEmployeeMemberships, getStore } from "./api";
import { markInviteAccepted, sessionForEmployee } from "./employees";
import { createClient } from "./supabase/server";
import { getServiceClient, hasServiceRole } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";

/** Shortest password the admin page or the reset page will accept. */
export const MIN_PASSWORD_LENGTH = 8;

// ── The service-role client ─────────────────────────────────────────────

/** Can accounts be looked up, created and changed from the server? */
export function accountsEnabled(): boolean {
  return hasServiceRole();
}

function adminClient() {
  return getServiceClient();
}

/**
 * May the old shared passwords (Seller@…, Employee@…, the demo customer)
 * still open an account?
 *
 * Only on a demo install with no Supabase at all — or when an operator
 * deliberately sets ALLOW_SHARED_PASSWORDS=true as a temporary escape
 * hatch. On a live marketplace they were a skeleton key: the store-owner
 * logins are `<store>@seller.banaadirmall.com`, the password was in the
 * README, and the first person to sign in with it got to keep the store.
 */
export function sharedPasswordsAllowed(): boolean {
  return !isSupabaseConfigured() || process.env.ALLOW_SHARED_PASSWORDS === "true";
}

/** Every Supabase Auth user. Paged, because the API caps a page at 1000. */
async function listAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  const admin = adminClient().auth.admin;
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

/** The Supabase account for this email, or null if it has none. */
export async function findAuthUser(email: string): Promise<User | null> {
  const clean = email.trim().toLowerCase();
  return (await listAuthUsers()).find((u) => u.email?.toLowerCase() === clean) ?? null;
}

// ── Who an email is ─────────────────────────────────────────────────────

export type ResolveResult = { session: Session } | { error: string };

/**
 * The store a Supabase account owns, if it is a seller account.
 *
 * ── app_metadata ONLY ────────────────────────────────────────────────────
 * user_metadata used to count too, and user_metadata is writable by the
 * signed-in user straight from the browser with the public key. One call —
 * `updateUser({ data: { role: "seller", store: "any-shop" } })` — made any
 * customer the owner of any store. app_metadata can only be written with
 * the service role key, i.e. by this server: at approval (bindStoreOwner),
 * when the admin sets an owner login's password, or by
 * scripts/migrate-seller-ownership.mjs for sellers from before this rule.
 */
function storeOfAuthUser(user: User | null): string | undefined {
  const app = user?.app_metadata ?? {};
  return app.role === "seller" && typeof app.store === "string" ? app.store : undefined;
}

/**
 * The session this email signs in as — decided by the email alone.
 *
 * Order matters: the admin email beats everything, a team row beats a
 * store application, and a customer is what is left.
 */
export async function resolveSession(email: string, authUser: User | null): Promise<ResolveResult> {
  const clean = email.trim().toLowerCase();

  if (isAdminEmail(clean)) {
    return { session: { name: ADMIN_NAME, email: clean, role: "admin" } };
  }

  const memberships = await getEmployeeMemberships(clean);
  if (memberships.length > 0) {
    const employee = memberships[0];
    await markInviteAccepted(employee);
    return { session: sessionForEmployee(employee, memberships) };
  }

  // A `<store>@seller…` address only means "owner" by itself on a demo
  // install. Live, its account must carry the binding too — otherwise
  // registering that address straight with Supabase would be enough.
  const ownerSlug =
    storeOfAuthUser(authUser) ?? (sharedPasswordsAllowed() ? parseSellerEmail(clean) : undefined);
  if (ownerSlug) {
    const store = await getStore(ownerSlug);
    if (store?.status === "pending") {
      return {
        error: `⏳ Your store application for "${store.name}" is currently awaiting admin review. Once approved, you will be able to access your store dashboard.`,
      };
    }
    if (store && (store.status === "suspended" || store.status === "rejected")) {
      return {
        error: `❌ Your store account for "${store.name}" is currently inactive or suspended. Please contact support.`,
      };
    }
    // An owner login for a store that does not exist is not an account.
    if (!store && parseSellerEmail(clean)) {
      return { error: "Invalid email or password. Please try again." };
    }
    return {
      session: {
        name: store?.name ?? displayName(clean, authUser),
        email: clean,
        role: "seller",
        store: ownerSlug,
      },
    };
  }

  return { session: { name: displayName(clean, authUser), email: clean, role: "customer" } };
}

function displayName(email: string, user: User | null): string {
  const name = user?.user_metadata?.name;
  return typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0] || "User";
}

/**
 * Is this email one the marketplace hands out rather than one a shopper
 * signs up with — the admin, a store's owner login, a team member?
 *
 * The sign-up forms refuse these. Letting someone register a customer
 * account on the admin's address is exactly how one email came to have
 * two passwords in the first place.
 */
export async function isReservedEmail(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (isAdminEmail(clean) || clean.endsWith(SELLER_EMAIL_SUFFIX)) return true;
  return (await getEmployeeMemberships(clean)).length > 0;
}

// ── Signing in ──────────────────────────────────────────────────────────

const INVALID = { error: "Invalid email or password. Please try again." } as const;

/** Does this password open the email under the old shared-password scheme? */
async function legacyPasswordMatches(email: string, password: string): Promise<boolean> {
  const demo = matchDemoUser(email, password);
  // The admin's bootstrap password (ADMIN_PASSWORD). With accounts enabled,
  // authenticate() refuses it the moment the admin has an account, so it
  // works exactly once. Without the service key there is no way to tell,
  // and it keeps working — one more reason the key is required live.
  if (demo?.role === "admin") return true;
  if (!sharedPasswordsAllowed()) return false;
  if (demo) return true;
  if (password === SELLER_PASSWORD && parseSellerEmail(email)) return true;
  if (password === EMPLOYEE_PASSWORD && (await getEmployeeMemberships(email)).length > 0) {
    return true;
  }
  return false;
}

/** Check the password, then work out who the email is. */
export async function authenticate(email: string, password: string): Promise<ResolveResult> {
  let authUser: User | null = null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.user) authUser = data.user;
    } catch (err) {
      console.warn("[Auth] Supabase sign in failed, checking built-in logins:", err);
    }
  }

  if (!authUser) {
    if (!(await legacyPasswordMatches(email, password))) return INVALID;

    if (accountsEnabled()) {
      try {
        // Once an email has its own account, that password is the only one.
        if (await findAuthUser(email)) return INVALID;
        // First sign-in under the old scheme: give the email a real account
        // holding the password they just used, so from now on there is one.
        const created = await adminClient().auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: await bindingFor(email, null),
        });
        if (created.error) console.warn("[Auth] Could not create account:", created.error.message);
      } catch (err) {
        // A lookup failure must not lock the owner out of their own shop.
        console.warn("[Auth] Account lookup failed, allowing built-in login:", err);
      }
    }
  }

  return resolveSession(email, authUser);
}

// ── The admin's accounts page ───────────────────────────────────────────

export interface AccountRow {
  email: string;
  name: string;
  /** What signing in as this email gives: "Admin", "Seller · Sahra Fashion", … */
  label: string;
  kind: "admin" | "staff" | "seller" | "customer";
  /** Has a Supabase account, i.e. its own password. */
  hasAccount: boolean;
  lastSignIn?: string;
}

/**
 * Everyone who can sign in: every Supabase account, plus the logins the
 * marketplace hands out that have not been turned into accounts yet (the
 * admin, each store's owner login, each team member).
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const [users, stores, employees] = await Promise.all([
    accountsEnabled() ? listAuthUsers() : Promise.resolve([] as User[]),
    getAllStores(),
    getAllEmployees(),
  ]);

  const storeName = new Map(stores.map((s) => [s.slug, s.name]));
  const rows = new Map<string, AccountRow>();

  const describe = (email: string, user: User | null): AccountRow => {
    const clean = email.toLowerCase();
    const base = {
      email: clean,
      hasAccount: Boolean(user),
      lastSignIn: user?.last_sign_in_at ?? undefined,
    };
    if (isAdminEmail(clean)) {
      return { ...base, name: ADMIN_NAME, label: "Admin", kind: "admin" };
    }
    const team = employees.filter((e) => e.email.trim().toLowerCase() === clean);
    if (team.length > 0) {
      const where = team
        .map((e) => (e.store === "platform" ? "Platform" : storeName.get(e.store) ?? e.store))
        .join(", ");
      return { ...base, name: team[0].name, label: `Staff · ${where}`, kind: "staff" };
    }
    const slug = parseSellerEmail(clean) ?? storeOfAuthUser(user);
    if (slug) {
      const name = storeName.get(slug) ?? slug;
      return { ...base, name, label: `Seller · ${name}`, kind: "seller" };
    }
    return { ...base, name: displayName(clean, user), label: "Customer", kind: "customer" };
  };

  for (const user of users) {
    if (user.email) rows.set(user.email.toLowerCase(), describe(user.email, user));
  }

  const handedOut = [
    ADMIN_EMAIL,
    ...stores.map((s) => `${s.slug}${SELLER_EMAIL_SUFFIX}`),
    ...employees.map((e) => e.email),
  ];
  for (const email of handedOut) {
    const clean = email.trim().toLowerCase();
    if (clean && !rows.has(clean)) rows.set(clean, describe(clean, null));
  }

  const order = { admin: 0, staff: 1, seller: 2, customer: 3 };
  return [...rows.values()].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.email.localeCompare(b.email),
  );
}

/**
 * What an account handed out by the marketplace must carry: a store
 * owner login (`<store>@seller…`) is bound to its store, since the
 * address alone no longer proves anything (see resolveSession).
 */
async function bindingFor(email: string, user: User | null): Promise<Record<string, unknown> | undefined> {
  const slug = parseSellerEmail(email);
  if (!slug || !(await getStore(slug))) return undefined;
  return { ...(user?.app_metadata ?? {}), role: "seller", store: slug };
}

/** Set an email's password, creating its account if it has none yet. */
export async function setAccountPassword(email: string, password: string): Promise<void> {
  const admin = adminClient().auth.admin;
  const user = await findAuthUser(email);
  const app_metadata = await bindingFor(email, user);
  const { error } = user
    ? await admin.updateUserById(user.id, { password, ...(app_metadata && { app_metadata }) })
    : await admin.createUser({ email, password, email_confirm: true, app_metadata });
  if (error) throw new Error(error.message);
}

/**
 * A single-use link that lets the holder choose a new password.
 *
 * The link is built on this site rather than Supabase's own, and carries a
 * token hash that is only redeemed when the form on /reset-password is
 * SUBMITTED — so a chat app fetching a preview of the link does not use it
 * up before the person ever taps it.
 *
 * An email with no account yet gets one first (with a random password
 * nobody knows), because there is nothing to reset otherwise.
 */
export async function createResetLink(email: string, origin: string): Promise<string> {
  const admin = adminClient().auth.admin;
  const user = await findAuthUser(email);
  const app_metadata = await bindingFor(email, user);
  if (!user) {
    const { error } = await admin.createUser({
      email,
      password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      email_confirm: true,
      app_metadata,
    });
    if (error) throw new Error(error.message);
  } else if (app_metadata) {
    await admin.updateUserById(user.id, { app_metadata });
  }
  const { data, error } = await admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(error.message);
  const hash = data.properties.hashed_token;
  return `${origin}/reset-password?token_hash=${encodeURIComponent(hash)}`;
}

// ── Store ownership ─────────────────────────────────────────────────────

/** The store this account has applied for, if any (server-written). */
export function appliedStoreOf(user: User | null): string | undefined {
  const app = user?.app_metadata ?? {};
  if (typeof app.applied_store === "string") return app.applied_store;
  return storeOfAuthUser(user);
}

/**
 * Remember which store an account applied for. app_metadata, so the
 * applicant cannot change it afterwards to point at somebody else's shop.
 */
export async function recordStoreApplication(userId: string, slug: string): Promise<void> {
  if (!accountsEnabled()) {
    console.warn(
      "[Accounts] SUPABASE_SERVICE_ROLE_KEY is not set — the store application was saved but cannot be linked to its applicant until it is.",
    );
    return;
  }
  const admin = adminClient().auth.admin;
  const { data } = await admin.getUserById(userId);
  const { error } = await admin.updateUserById(userId, {
    app_metadata: { ...(data.user?.app_metadata ?? {}), applied_store: slug },
  });
  if (error) throw new Error(error.message);
}

/**
 * Approval: the account that applied for this store becomes its owner.
 * Returns how many accounts were bound (0 when nobody applied through the
 * form — e.g. a store the admin created — whose owner login the admin
 * then sets up from /admin/accounts).
 */
export async function bindStoreOwner(slug: string): Promise<number> {
  if (!accountsEnabled()) return 0;
  const admin = adminClient().auth.admin;
  const applicants = (await listAuthUsers()).filter((u) => u.app_metadata?.applied_store === slug);
  for (const user of applicants) {
    const { error } = await admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, role: "seller", store: slug },
    });
    if (error) console.warn(`[Accounts] Could not bind ${user.email} to ${slug}:`, error.message);
  }
  return applicants.length;
}

// ── The admin's "Store owners" panel ───────────────────────────────────

export interface OwnerClaim {
  email: string;
  /** Why this account looks like the owner — shown so the admin can judge. */
  reason: string;
  createdAt?: string;
  lastSignIn?: string;
  emailConfirmed: boolean;
}

export interface StoreOwnership {
  slug: string;
  name: string;
  status: string;
  /** Accounts already bound as owner (app_metadata). */
  owners: string[];
  /** Unbound accounts that claim this store, for the admin to confirm. */
  claims: OwnerClaim[];
}

/**
 * Every store, its confirmed owner(s), and the accounts that claim it but
 * are not bound yet — the old user_metadata record, a pending application,
 * or a `<store>@seller…` owner login. Claims are evidence, not proof: the
 * old field was user-editable, which is why a human confirms each one.
 */
export async function listStoreOwnership(): Promise<StoreOwnership[]> {
  const [users, stores] = await Promise.all([listAuthUsers(), getAllStores()]);
  const rows = new Map<string, StoreOwnership>(
    stores.map((s) => [
      s.slug,
      { slug: s.slug, name: s.name, status: s.status ?? "active", owners: [], claims: [] },
    ]),
  );

  for (const user of users) {
    const email = user.email?.toLowerCase();
    if (!email) continue;
    const bound = storeOfAuthUser(user);
    if (bound) {
      rows.get(bound)?.owners.push(email);
      continue;
    }
    const meta = user.user_metadata ?? {};
    const claims: [string, string][] = [];
    const login = parseSellerEmail(email);
    if (login) claims.push([login, "Store owner login address"]);
    if (typeof user.app_metadata?.applied_store === "string") {
      claims.push([user.app_metadata.applied_store, "Applied for this store (verified)"]);
    }
    if (meta.role === "seller" && typeof meta.store === "string") {
      claims.push([meta.store, "Old seller record (could have been edited by the user)"]);
    }
    const seen = new Set<string>();
    for (const [slug, reason] of claims) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      rows.get(slug)?.claims.push({
        email,
        reason,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at ?? undefined,
        emailConfirmed: Boolean(user.email_confirmed_at),
      });
    }
  }

  return [...rows.values()].sort(
    (a, b) => Number(a.owners.length > 0) - Number(b.owners.length > 0) || a.name.localeCompare(b.name),
  );
}

/** Make this email an owner of this store. The account must already exist. */
export async function setStoreOwner(slug: string, email: string): Promise<void> {
  if (!(await getStore(slug))) throw new Error(`There is no store "${slug}".`);
  const user = await findAuthUser(email);
  if (!user) {
    throw new Error(
      `${email} has no account yet. Ask them to register (or set a password for it below), then try again.`,
    );
  }
  if (isAdminEmail(email)) throw new Error("The admin account can't also be a store owner.");
  const current = storeOfAuthUser(user);
  if (current && current !== slug) {
    throw new Error(`${email} already owns "${current}". One account owns one store.`);
  }
  const { error } = await adminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "seller", store: slug },
  });
  if (error) throw new Error(error.message);
}

/** Take a store away from this account; it signs in as a customer after. */
export async function removeStoreOwner(slug: string, email: string): Promise<void> {
  const user = await findAuthUser(email);
  if (!user || storeOfAuthUser(user) !== slug) return;
  // Explicit nulls: Supabase MERGES app_metadata, so leaving a key out
  // would leave it in place.
  const { error } = await adminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { role: null, store: null },
  });
  if (error) throw new Error(error.message);
}

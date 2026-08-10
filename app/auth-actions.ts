"use server";

/**
 * Sign-in / sign-out / sign-up server actions.
 * Authenticates against Supabase Auth when configured, with fallback to demo accounts.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMPLOYEE_PASSWORD,
  homeForRole,
  matchDemoUser,
  parseSellerEmail,
  SELLER_PASSWORD,
  SESSION_COOKIE,
  type Session,
} from "@/lib/auth";
import { markInviteAccepted, sessionForEmployee } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export interface AuthActionState {
  error?: string | null;
  success?: boolean;
  message?: string;
}

export type SignInState = AuthActionState;

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter both email and password." };
  }

  // 1. Try Supabase Auth if configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.user) {
        const metadata = data.user.user_metadata || {};
        const role = (metadata.role || "customer") as Session["role"];
        const session: Session = {
          name: metadata.name || data.user.email?.split("@")[0] || "User",
          email: data.user.email || email,
          role,
          store: metadata.store || undefined,
          access: metadata.access || undefined,
        };

        if (role === "seller" && metadata.store) {
          const { getStore } = await import("@/lib/api");
          const store = await getStore(metadata.store);
          if (store && store.status === "pending") {
            return {
              error: `⏳ Your store application for "${store.name}" is currently awaiting admin review. Once approved, you will be able to access your store dashboard.`,
            };
          }
          if (store && (store.status === "suspended" || store.status === "rejected")) {
            return {
              error: `❌ Your store application for "${store.name}" is currently inactive or suspended. Please contact support.`,
            };
          }
        }

        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
          sameSite: "lax",
        });
        redirect(homeForRole(session.role));
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      console.warn("[Auth] Supabase sign in failed, checking demo fallback:", err);
    }
  }

  // 2. Built-in accounts fallback (admin, customer).
  let session: Session | null = matchDemoUser(email, password);

  /*
   * 3. Store-owner logins, resolved against the LIVE store list.
   *
   * These were previously generated from the bundled seed stores, so a
   * deleted demo brand kept a working owner login and a real store added
   * through the dashboard had none. Checking the catalogue means the set of
   * valid owner logins is exactly the set of stores that exist.
   */
  if (!session && password === SELLER_PASSWORD) {
    const slug = parseSellerEmail(email);
    if (slug) {
      const { getStore } = await import("@/lib/api");
      const store = await getStore(slug);
      if (store) {
        if (store.status === "pending") {
          return {
            error: `⏳ Your store application for "${store.name}" is currently awaiting admin review. Once approved, you will be able to access your store dashboard.`,
          };
        }
        if (store.status === "suspended" || store.status === "rejected") {
          return {
            error: `❌ Your store account for "${store.name}" is currently inactive or suspended.`,
          };
        }
        if (store.status === "active") {
          session = { name: store.name, email, role: "seller", store: store.slug };
        }
      }
    }
  }

  /*
   * 4. Employees added from a Team page (password is EMPLOYEE_PASSWORD).
   *
   * This used to read `getDB().employees` — the JSON overlay — and only
   * that. Every employee added while Supabase is configured is written to
   * Supabase and never touches the overlay, so the lookup found nothing and
   * the person the owner had just invited was told their password was
   * wrong. Which is how a team page can look like it works, save a real
   * row, and still hand out an account nobody can sign in to.
   */
  if (!session && password === EMPLOYEE_PASSWORD) {
    const { getEmployeeMemberships } = await import("@/lib/api");
    /*
     * Every team, not the first one found.
     *
     * Someone invited to two shops has two rows, and reading only one of
     * them meant the other store simply did not exist as far as their
     * account was concerned. The list goes into the session so the
     * dashboard can offer a switcher; they still LAND in the first.
     */
    const memberships = await getEmployeeMemberships(email);
    const employee = memberships[0];
    if (employee) {
      session = sessionForEmployee(employee, memberships);
      await markInviteAccepted(employee);
    }
  }

  if (!session) {
    return { error: "Invalid email or password. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  redirect(homeForRole(session.role));
}

/** Customer registration action */
export async function signUpCustomer(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "Please fill in all required fields." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
            role: "customer",
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const session: Session = {
          name,
          email,
          role: "customer",
        };
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
          sameSite: "lax",
        });
        redirect("/account");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      return { error: (err as Error).message || "Registration failed." };
    }
  }

  // Local demo session creation
  const session: Session = {
    name,
    email,
    role: "customer",
  };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  redirect("/account");
}

/** Seller & Store Registration action */
export async function signUpSeller(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const storeName = String(formData.get("storeName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const about = String(formData.get("about") ?? "").trim();

  if (!storeName || !ownerName || !email || !password) {
    return { error: "Please fill in all required store and contact details." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /*
   * The number they just gave us IS their WhatsApp number.
   *
   * Orders reach a seller over WhatsApp (see lib/whatsapp.ts). Leaving that
   * field empty at registration meant every order for a new store went to
   * the platform's fallback number until the owner happened to find the
   * field in Settings — so the shop's first sales were routed away from the
   * person who had to pack them. Asking for the same number twice, in two
   * places, was never going to fix that.
   *
   * Normalised on the way in, because sellers write a phone number every
   * possible way and a malformed one is a dead button.
   */
  const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");
  const whatsapp = normalizeWhatsAppNumber(phone);

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();

      // 1. Create auth user in Supabase or authenticate existing user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: ownerName,
            role: "seller",
            store: storeSlug,
            phone,
          },
        },
      });

      if (authErr) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInErr || !signInData.user) {
          return {
            error: authErr.message.toLowerCase().includes("already registered")
              ? "An account with this email already exists. Please verify your password to submit your store application."
              : authErr.message,
          };
        }

        await supabase.auth.updateUser({
          data: {
            name: ownerName,
            role: "seller",
            store: storeSlug,
            phone,
          },
        });
      }

      // 2. Insert store into Supabase stores table with status 'pending'
      await supabase.from("stores").upsert(
        {
          id: `store-${Date.now()}`,
          slug: storeSlug,
          name: storeName,
          tagline: about.slice(0, 100) || "Quality products & local service",
          description: about,
          owner: ownerName,
          location: city || "Mogadishu",
          category: category || "general",
          phone,
          whatsapp,
          status: "pending",
        },
        { onConflict: "slug" }
      );
    } catch (err: unknown) {
      return { error: (err as Error).message || "Seller sign up failed." };
    }
  }

  // Also save to local DB as fallback/cache
  const { mutateDB } = await import("@/lib/db");
  await mutateDB((db) => {
    db.stores = db.stores || [];
    const existing = db.stores.find((s) => s.slug === storeSlug);
    if (!existing) {
      db.stores.push({
        slug: storeSlug,
        name: storeName,
        tagline: about.slice(0, 100) || "Quality products & local service",
        city: city || "Mogadishu",
        category: category || "general",
        whatsapp,
        icon: "🏪",
        art: { from: "#e0f2fe", to: "#bae6fd" },
        rating: 5.0,
        reviewCount: 1,
        followers: 1,
        joinedYear: 2026,
        verified: false,
        official: false,
        status: "pending",
      });
    } else {
      existing.status = "pending";
      // Re-applying updates the contact number too.
      if (whatsapp) existing.whatsapp = whatsapp;
    }
  });

  return {
    success: true,
    message: "🎉 Your store application has been submitted! It is currently awaiting admin review.",
  };
}

/**
 * Move this account to another of its stores.
 *
 * ── The check is the point ───────────────────────────────────────────────
 * The slug arrives from the browser, so it is a request and not a fact.
 * Membership is re-read from the employee table and the grants are rebuilt
 * from the row for THAT store — a manager at one shop who is a viewer at
 * the other must arrive as a viewer. Trusting the cookie's existing
 * `permissions`, or the `stores` list inside it, would let anyone who can
 * edit a cookie walk into any store on the marketplace with full access.
 */
export async function switchStore(storeSlug: string): Promise<void> {
  const slug = String(storeSlug ?? "").trim();
  const { getSession } = await import("@/lib/session");
  const session = await getSession();
  if (!session || session.role === "customer") redirect("/login");
  if (!slug || slug === session.store) redirect("/vendor");

  const { getStore, getEmployeeForStore, getEmployeeMemberships } = await import("@/lib/api");
  const store = await getStore(slug);
  if (!store || store.status !== "active") {
    throw new Error("That store is not available.");
  }

  let next: Session = { ...session, store: slug };

  // An owner login has no employee row and owns exactly one store, so
  // there is nothing here for it to switch to. Admins may preview any
  // store; employees may only reach the ones they are actually on.
  if (session.access) {
    const [membership, memberships] = await Promise.all([
      getEmployeeForStore(session.email, slug),
      getEmployeeMemberships(session.email),
    ]);
    if (!membership) throw new Error("You are not on that store's team.");
    next = { ...sessionForEmployee(membership, memberships) };
  } else if (session.role !== "admin") {
    throw new Error("You can only manage your own store.");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(next), {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  redirect("/vendor");
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[Auth] Supabase signOut error:", err);
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}

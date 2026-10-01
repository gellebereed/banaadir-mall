"use server";

/**
 * Sign-in / sign-out / sign-up server actions.
 * Who an email is and which password it takes is decided in lib/accounts.ts.
 */

import { redirect } from "next/navigation";
import { authenticate, isReservedEmail } from "@/lib/accounts";
import { homeForRole, type Session } from "@/lib/auth";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";
import { sessionForEmployee } from "@/lib/employees";
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

  /*
   * One email, one password, one role — see lib/accounts.ts. The role is
   * decided by WHO the email is, never by which password happened to match,
   * which is what used to send the admin to the shopper view when they
   * typed their other password.
   */
  const result = await authenticate(email, password);
  if ("error" in result) return { error: result.error };

  await setSessionCookie(result.session);
  redirect(homeForRole(result.session.role));
}

/** Refused on the sign-up forms — see isReservedEmail. */
const RESERVED_EMAIL_ERROR =
  "This email already belongs to an admin, staff or store login. Please sign in instead, or ask the marketplace admin to send you a password reset link.";

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
  if (await isReservedEmail(email)) {
    return { error: RESERVED_EMAIL_ERROR };
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
        await setSessionCookie(session);
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
  await setSessionCookie(session);
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
  if (await isReservedEmail(email)) {
    return { error: RESERVED_EMAIL_ERROR };
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

  await setSessionCookie(next);
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

  await clearSessionCookie();
  redirect("/");
}

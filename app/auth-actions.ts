"use server";

/**
 * Sign-in / sign-out / sign-up server actions.
 * Who an email is and which password it takes is decided in lib/accounts.ts.
 */

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
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
  const { headers } = await import("next/headers");
  const { clientIp, recordSignInFailure, recordSignInSuccess, signInBlockedFor } = await import(
    "@/lib/rate-limit"
  );
  const ip = clientIp(await headers());
  const wait = signInBlockedFor(email, ip);
  if (wait > 0) {
    return {
      error: `Too many failed attempts. Please wait ${wait} minute${wait === 1 ? "" : "s"} and try again.`,
    };
  }

  const result = await authenticate(email, password);
  if ("error" in result) {
    // Only a wrong password counts — not "your store is awaiting review".
    if (result.error.startsWith("Invalid email or password")) recordSignInFailure(email, ip);
    return { error: result.error };
  }
  recordSignInSuccess(email, ip);

  await setSessionCookie(result.session);
  // Back to the page that sent them here (a product they wanted to review,
  // the account page they opened) — else their role's home.
  redirect(safeNext(formData.get("next")) ?? homeForRole(result.session.role));
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
          phone: phone || undefined,
        };
        await setSessionCookie(session);
        redirect(safeNext(formData.get("next")) ?? "/account");
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
    phone: phone || undefined,
  };
  await setSessionCookie(session);
  redirect(safeNext(formData.get("next")) ?? "/account");
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
  if (!storeSlug) {
    return { error: "Please use letters or numbers in your store name." };
  }

  /*
   * The number they just gave us IS their WhatsApp number.
   *
   * Orders reach a seller over WhatsApp (see lib/whatsapp.ts). Leaving that
   * field empty at registration meant every order for a new store went to
   * the platform's fallback number until the owner happened to find the
   * field in Settings. Normalised on the way in, because sellers write a
   * phone number every possible way and a malformed one is a dead button.
   */
  const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");
  const whatsapp = normalizeWhatsAppNumber(phone);

  /*
   * ── A store name that is taken stays taken ───────────────────────────
   * The application used to UPSERT on the slug. Applying as "Karaca Home"
   * therefore overwrote the real Karaca Home: its status flipped to
   * pending (off the marketplace) and its WhatsApp number became the
   * applicant's, so its orders went to a stranger. Now an existing slug
   * is only accepted back from the account that applied for it — a
   * rejected applicant trying again.
   */
  const { getStore } = await import("@/lib/api");
  const existing = await getStore(storeSlug);
  const TAKEN = {
    error: `A store called "${existing?.name ?? storeName}" is already on Banaadir Mall. Please choose a different store name.`,
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { appliedStoreOf, recordStoreApplication } = await import("@/lib/accounts");

      // Only the applicant's own name and phone go in user_metadata — that
      // field is theirs to edit. Which store they applied for is recorded
      // server-side in app_metadata (recordStoreApplication).
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: ownerName, phone } },
      });

      let user = authErr ? null : authData.user;
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
        user = signInData.user;
        await supabase.auth.updateUser({ data: { name: ownerName, phone } });
      }
      if (!user) return { error: "Could not create your account. Please try again." };

      if (existing && appliedStoreOf(user) !== storeSlug) return TAKEN;
      if (existing?.status === "active") {
        return { error: `"${existing.name}" is already open — sign in to manage it.` };
      }

      await recordStoreApplication(user.id, storeSlug);

      // The store row is written by the server (service role): with the
      // database locked down, the applicant's own key can't touch `stores`.
      const { getDataClient } = await import("@/lib/supabase/service");
      const row = {
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
      };
      const { error: storeErr } = existing
        ? await getDataClient().from("stores").update(row).eq("slug", storeSlug)
        : await getDataClient().from("stores").insert({ id: `store-${Date.now()}`, ...row });
      if (storeErr) return { error: `Could not save your application: ${storeErr.message}` };
    } catch (err: unknown) {
      return { error: (err as Error).message || "Seller sign up failed." };
    }
  } else if (existing) {
    // Demo install: there is no account to prove a re-application is the
    // same person's, so a taken name is simply taken.
    return TAKEN;
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
 * "Open my store dashboard" — for an applicant whose store has just been
 * approved while they were signed in as a shopper.
 *
 * Their cookie still says customer; without this they had to sign out and
 * in again, which nothing told them to do. Who they are is re-read from
 * their account on the server (resolveSession), never taken from the cookie.
 */
export async function openApprovedStore(): Promise<void> {
  const { getSession } = await import("@/lib/session");
  const session = await getSession();
  if (!session?.appliedStore) redirect("/account");

  const { accountsEnabled, findAuthUser, resolveSession } = await import("@/lib/accounts");
  if (!accountsEnabled()) redirect("/login?next=/vendor");
  const result = await resolveSession(session.email, await findAuthUser(session.email));
  if ("error" in result || result.session.role !== "seller") redirect("/account");
  await setSessionCookie(result.session);
  redirect("/vendor");
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

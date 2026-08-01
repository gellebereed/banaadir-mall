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
  SESSION_COOKIE,
  type Session,
} from "@/lib/auth";
import { getDB } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export interface AuthActionState {
  error: string | null;
  success?: boolean;
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

  // 2. Built-in demo accounts fallback (admin, store owners, customer).
  let session: Session | null = matchDemoUser(email, password);

  // 3. Employees added from a Team page (password is EMPLOYEE_PASSWORD).
  if (!session && password === EMPLOYEE_PASSWORD) {
    const employee = (await getDB()).employees.find(
      (e) => e.email.toLowerCase() === email,
    );
    if (employee) {
      session =
        employee.store === "platform"
          ? { name: employee.name, email: employee.email, role: "admin", access: employee.role }
          : {
              name: employee.name,
              email: employee.email,
              role: "seller",
              store: employee.store,
              access: employee.role,
            };
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

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      
      // 1. Create auth user in Supabase
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
        return { error: authErr.message };
      }

      // 2. Insert store into Supabase stores table
      await supabase.from("stores").upsert({
        id: `store-${Date.now()}`,
        slug: storeSlug,
        name: storeName,
        tagline: about.slice(0, 100) || "Quality products & local service",
        description: about,
        owner: ownerName,
        location: city || "Mogadishu",
        status: "active",
      }, { onConflict: "slug" });

      if (authData.user) {
        const session: Session = {
          name: ownerName,
          email,
          role: "seller",
          store: storeSlug,
        };
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
          sameSite: "lax",
        });
        redirect("/vendor");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      return { error: (err as Error).message || "Seller sign up failed." };
    }
  }

  // Fallback demo seller session
  const session: Session = {
    name: ownerName,
    email,
    role: "seller",
    store: storeSlug,
  };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
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

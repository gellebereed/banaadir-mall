"use server";

/**
 * Sign-in / sign-out server actions.
 * Validates demo accounts (lib/auth.ts) AND employees created from the
 * Team pages (stored in data/db.json), then sets the session cookie.
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

export interface SignInState {
  error: string | null;
}

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // 1. Built-in demo accounts (admin, store owners, customer).
  let session: Session | null = matchDemoUser(email, password);

  // 2. Employees added from a Team page (password is EMPLOYEE_PASSWORD).
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
    return { error: "Wrong email or password — try one of the demo accounts." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  redirect(homeForRole(session.role));
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}

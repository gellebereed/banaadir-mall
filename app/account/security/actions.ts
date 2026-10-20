"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PASSWORD & EMAIL — changed by the person themselves.
 * ─────────────────────────────────────────────────────────────────────────
 * Before this, only the marketplace admin could change anyone's password,
 * and nobody could change an email at all.
 *
 * Both changes prove it is really them first: the CURRENT password is
 * checked (and counted by the sign-in throttle, so this form can't be used
 * to guess it). That sign-in also gives a Supabase session to make the
 * change with — no service key involved, so these only ever touch the
 * account that just proved its password.
 *
 * ── Who may change their email ───────────────────────────────────────────
 * Customers and store owners. NOT staff — their team rows are keyed by
 * email, so a new address would silently leave every team — and NOT the
 * admin, whose address is configuration (ADMIN_EMAIL). The new address
 * only takes effect once confirmed from a link Supabase emails to it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { headers } from "next/headers";
import {
  accountsEnabled,
  findAuthUser,
  isReservedEmail,
  isRetiredStoreLogin,
  MIN_PASSWORD_LENGTH,
} from "@/lib/accounts";
import { clientIp, recordSignInFailure, recordSignInSuccess, signInBlockedFor } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { getSession, setSessionCookie } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export interface SecurityState {
  ok?: string;
  error?: string;
}

/** Sign in as the current user with the password they typed. */
async function proveCurrentPassword(password: string) {
  const session = await getSession();
  if (!session) return { error: "Please sign in again." } as const;
  if (!isSupabaseConfigured()) {
    return { error: "Password and email changes need the live database (this is a demo install)." } as const;
  }

  const ip = clientIp(await headers());
  const wait = signInBlockedFor(session.email, ip);
  if (wait > 0) return { error: `Too many wrong passwords. Try again in ${wait} minutes.` } as const;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: session.email, password });
  if (error) {
    recordSignInFailure(session.email, ip);
    return { error: "Your current password isn't right." } as const;
  }
  recordSignInSuccess(session.email, ip);
  return { session, supabase } as const;
}

export async function changePassword(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== String(formData.get("confirmPassword") ?? "")) {
    return { error: "The two new passwords don't match." };
  }

  const proof = await proveCurrentPassword(String(formData.get("currentPassword") ?? ""));
  if ("error" in proof) return { error: proof.error };

  const { error } = await proof.supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { ok: "Password changed. Use the new one next time you sign in." };
}

export async function changeEmail(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again." };
  if (session.access || session.role === "admin") {
    return {
      error:
        session.role === "admin" && !session.access
          ? "The admin address is set in the site's configuration (ADMIN_EMAIL)."
          : "Your email is how your store finds you on its team — ask the store owner to invite your new address instead.",
    };
  }

  const email = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (email === session.email) return { error: "That's already your email." };
  if (email !== String(formData.get("confirmEmail") ?? "").trim().toLowerCase()) {
    return { error: "The two email addresses don't match." };
  }
  if (await isReservedEmail(email)) {
    return { error: "That address belongs to a marketplace, staff or store login." };
  }

  const proof = await proveCurrentPassword(String(formData.get("currentPassword") ?? ""));
  if ("error" in proof) return { error: proof.error };

  /*
   * A retired `<store>@seller…` login can't take the normal route: by
   * default Supabase confirms an email change from the OLD address too,
   * and nobody receives mail there — the switch would never complete. Its
   * password has just been proven, so the change is applied directly
   * (the address was typed twice to catch typos) and they stay signed in.
   */
  if (isRetiredStoreLogin(session.email) && accountsEnabled()) {
    const user = await findAuthUser(session.email);
    if (!user) return { error: "Your account could not be found. Please sign in again." };
    if (await findAuthUser(email)) return { error: "Another account already uses that email." };
    const { error } = await getServiceClient().auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    if (error) return { error: error.message };
    const { ownersChanged } = await import("@/lib/accounts");
    ownersChanged();
    await setSessionCookie({ ...session, email });
    return { ok: `Done — your login email is now ${email}. Use it with your current password from now on.` };
  }

  const origin = await requestOrigin();
  const { error } = await proof.supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${origin}/api/auth/callback?next=/account/security?email=confirmed` },
  );
  if (error) {
    return {
      error: /already|registered|exists/i.test(error.message)
        ? "Another account already uses that email."
        : error.message,
    };
  }
  return {
    ok: `Almost done — we've emailed a confirmation link to ${email}. Your email changes when you open it${
      " (Supabase may also ask you to confirm from your current address)"
    }. Until then, keep signing in with ${session.email}.`,
  };
}

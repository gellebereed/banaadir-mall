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
import { redirect } from "next/navigation";
import {
  accountsEnabled,
  findAuthUser,
  isReservedEmail,
  isRetiredStoreLogin,
  MIN_PASSWORD_LENGTH,
} from "@/lib/accounts";
import { clientIp, recordSignInFailure, recordSignInSuccess, signInBlockedFor } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/session";
import { getServiceClient, hasServiceRole } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";
import { isPhoneLoginEmail } from "@/lib/phone-auth";

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
  // Phone sign-ups have a stand-in email Supabase has never heard of; their
  // Supabase login is the number itself.
  const { error } = isPhoneLoginEmail(session.email)
    ? await supabase.auth.signInWithPassword({ phone: session.phone ?? "", password })
    : await supabase.auth.signInWithPassword({ email: session.email, password });
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
  // A phone sign-up's orders are keyed on its stand-in address; adding an
  // email would move the account to a new key and strand them.
  if (isPhoneLoginEmail(session.email)) {
    return { error: "Accounts made with a phone number sign in with the number." };
  }
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

/*
 * ─────────────────────────────────────────────────────────────────────────
 *  DELETE MY ACCOUNT — a shopper closing their own account.
 * ─────────────────────────────────────────────────────────────────────────
 * Before this there was no way to leave: Apple and Google both refuse apps
 * whose users can't delete their account from inside the app, and a
 * shopper who asked had to message the owner.
 *
 * What goes, and what stays:
 *   · the login itself (the Supabase user) — the email or number can sign
 *     up again afterwards as a brand-new account;
 *   · saved recommendations and "tell me when it's back" alerts;
 *   · past ORDERS stay, because the shops that fulfilled them need the
 *     record for their books and for returns — but they are cut loose from
 *     the address (`orders.email` is replaced), so a later sign-up with the
 *     same email or number does not inherit that history or its rewards.
 *
 * Shoppers only. A store owner's login is attached to a store, staff to a
 * team and the admin to configuration; deleting those from here would
 * orphan a shop, so they are pointed at the person who can do it properly.
 *
 * Refused while an order is still on its way: the shop must still be able
 * to reach the customer about it, and the customer to track it.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function deleteAccount(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again." };
  if (session.role !== "customer" || session.access) {
    return {
      error:
        "Store, team and admin logins can't be deleted from here. Please contact Banaadir Mall support and we'll close it for you.",
    };
  }
  if (String(formData.get("confirmText") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE in the box to confirm." };
  }

  const { getOrders } = await import("@/lib/api");
  const { orderBelongsTo } = await import("@/lib/order-utils");
  const mine = (await getOrders()).filter((o) => orderBelongsTo(o, session));
  const open = mine.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  if (open.length > 0) {
    return {
      error: `You have ${open.length} order${open.length === 1 ? "" : "s"} still on the way. You can delete your account once ${
        open.length === 1 ? "it has" : "they have"
      } been delivered or cancelled.`,
    };
  }

  const proof = await proveCurrentPassword(String(formData.get("currentPassword") ?? ""));
  if ("error" in proof) return { error: proof.error };
  if (!hasServiceRole()) {
    return { error: "Account deletion isn't available right now. Please contact support." };
  }

  const { data: me } = await proof.supabase.auth.getUser();
  if (!me.user) return { error: "Please sign in again." };

  const db = getServiceClient();
  // Order history first: if anything below fails, the worst case is an
  // account that still exists, never a deleted login whose orders a new
  // sign-up with the same address would inherit.
  if (mine.length > 0) {
    const detached = `deleted-${me.user.id}@deleted.banaadirmall.com`;
    const { error } = await db.from("orders").update({ email: detached }).in(
      "id",
      mine.map((o) => o.id),
    );
    if (error) {
      console.error("[Account] delete: could not detach orders:", error.message);
      return { error: "Something went wrong. Your account was not deleted — please try again." };
    }
  }

  const { deleteSyncedProfile } = await import("@/lib/reco/sync");
  await deleteSyncedProfile(session.email).catch((err) => console.warn("[Account] delete: reco", err));
  {
    const { error } = await db.from("product_alerts").delete().eq("email", session.email.trim().toLowerCase());
    if (error) console.warn("[Account] delete: alerts", error.message);
  }

  const { error } = await db.auth.admin.deleteUser(me.user.id);
  if (error) {
    console.error("[Account] delete: auth user:", error.message);
    return { error: "Something went wrong. Please try again, or contact support." };
  }

  await proof.supabase.auth.signOut().catch(() => {});
  await clearSessionCookie();
  redirect("/goodbye");
}

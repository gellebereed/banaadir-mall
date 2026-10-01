"use server";

/**
 * Password management for the marketplace administrator.
 *
 * Only the MAIN admin account may use these — not platform staff, whatever
 * their grants. Being able to set anyone's password is being able to become
 * anyone, the admin included, so it is not something a team role hands out.
 */

import { headers } from "next/headers";
import {
  accountsEnabled,
  createResetLink,
  MIN_PASSWORD_LENGTH,
  setAccountPassword,
} from "@/lib/accounts";
import { getSession } from "@/lib/session";

export interface AccountActionResult {
  ok?: string;
  error?: string;
  link?: string;
}

async function guard(): Promise<string | null> {
  const session = await getSession();
  if (session?.role !== "admin" || session.access) {
    return "Only the marketplace administrator can manage passwords.";
  }
  if (!accountsEnabled()) {
    return "Password management needs SUPABASE_SERVICE_ROLE_KEY in the site's environment variables.";
  }
  return null;
}

function cleanEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function adminSetPassword(
  email: string,
  password: string,
): Promise<AccountActionResult> {
  const refused = await guard();
  if (refused) return { error: refused };

  const target = cleanEmail(email);
  if (!target.includes("@")) return { error: "That is not an email address." };
  if (String(password ?? "").length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  try {
    await setAccountPassword(target, password);
    return { ok: `Password updated for ${target}. Their old password no longer works.` };
  } catch (err) {
    return { error: (err as Error).message || "Could not update the password." };
  }
}

export async function adminCreateResetLink(email: string): Promise<AccountActionResult> {
  const refused = await guard();
  if (refused) return { error: refused };

  const target = cleanEmail(email);
  if (!target.includes("@")) return { error: "That is not an email address." };

  // The link must point at the site the admin is using, whatever its domain.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = h.get("origin") ?? `${proto}://${host}`;

  try {
    const link = await createResetLink(target, origin);
    return { ok: "Reset link created. It works once.", link };
  } catch (err) {
    return { error: (err as Error).message || "Could not create a reset link." };
  }
}

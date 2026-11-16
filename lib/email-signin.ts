import type { User } from "@supabase/supabase-js";
import { resolveSession } from "@/lib/accounts";
import { setSessionCookie } from "@/lib/session";

/**
 * Sign the person in to the marketplace after Supabase confirmed their
 * email (the link in the "Confirm your sign-up" email).
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 * The site keeps its own session cookie (lib/session.ts); a Supabase
 * session alone does not sign anyone in here. Confirming the email used to
 * land the new customer on the shop still signed out, with nothing to say
 * the account now existed — so they signed up again. Clicking the link
 * proves the address, which is exactly what signing in requires.
 *
 * Returns false when there is nobody to sign in (no email, a store still
 * under review, …) — the caller then just sends them to the login page.
 */
export async function signInConfirmedUser(user: User | null | undefined): Promise<boolean> {
  if (!user?.email) return false;
  const result = await resolveSession(user.email, user);
  if ("error" in result) return false;
  await setSessionCookie(result.session);
  return true;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Did this browser's Supabase session come from a password-RECOVERY link?
 *
 * Signing in normally also leaves a Supabase session cookie, so "has a
 * session" can't be what lets someone choose a new password without the
 * old one — anyone at a signed-in computer could. Supabase records how a
 * session was made in the token's `amr` claim; only a recovery (or
 * one-time code) sign-in counts here. getUser() first, so the token has
 * been checked by Supabase before its claims are trusted.
 */
export async function isRecoverySession(supabase: SupabaseClient): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const amr: { method?: string }[] = Array.isArray(payload.amr) ? payload.amr : [];
    return amr.some((m) => m.method === "recovery" || m.method === "otp");
  } catch {
    return false;
  }
}

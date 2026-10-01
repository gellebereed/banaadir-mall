"use server";

/**
 * Redeeming a password reset link (see createResetLink in lib/accounts.ts).
 *
 * The token is only verified HERE, when the form is submitted — never when
 * the page loads. Messaging apps fetch a link to draw its preview, and a
 * token redeemed on page load would be spent by WhatsApp before the person
 * ever tapped it.
 */

import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH, resolveSession } from "@/lib/accounts";
import { homeForRole } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export interface ResetState {
  error?: string | null;
}

export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!tokenHash || !isSupabaseConfigured()) {
    return { error: "This reset link is not valid. Ask the marketplace admin for a new one." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error || !data.user?.email) {
    return {
      error: "This reset link has expired or has already been used. Ask the marketplace admin for a new one.",
    };
  }

  const updated = await supabase.auth.updateUser({ password });
  if (updated.error) return { error: updated.error.message };

  // Signed straight in, as whoever this email is.
  const result = await resolveSession(data.user.email, data.user);
  if ("error" in result) return { error: result.error };

  await setSessionCookie(result.session);
  redirect(homeForRole(result.session.role));
}

"use server";

import { headers } from "next/headers";
import { clientIp, recordSignInFailure, signInBlockedFor } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

/**
 * Email a password-reset link — sent by Supabase Auth itself, so no mail
 * provider has to be set up.
 *
 * The answer is the same whether or not the address has an account:
 * saying "no such account" would let anyone test which emails are
 * customers, sellers or staff here. Each request also counts against the
 * sign-in throttle, so the form can't be used to flood someone's inbox.
 */
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you sign in with." };
  if (!isSupabaseConfigured()) {
    return { error: "Password reset by email needs the live database (this is a demo install)." };
  }

  const ip = clientIp(await headers());
  const wait = signInBlockedFor(email, ip);
  if (wait > 0) return { error: `Too many requests. Please try again in ${wait} minutes.` };
  recordSignInFailure(email, ip);

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
  });
  // Rate limits from Supabase's own mailer are worth surfacing; anything
  // about the address itself is not (see above).
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: "Too many emails were sent just now. Please wait a few minutes and try again." };
  }
  if (error) console.warn("[Auth] resetPasswordForEmail:", error.message);
  return { sent: true };
}
